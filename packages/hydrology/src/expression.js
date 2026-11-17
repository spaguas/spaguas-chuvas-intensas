/** Small deterministic arithmetic language. Never compiles or executes JavaScript. */
export class ExpressionError extends Error {
  constructor(message) { super(message); this.code='INVALID_EXPRESSION'; this.status=422; }
}
const functions = Object.freeze({
  ln:{arity:1,run:Math.log}, log:{arity:1,run:Math.log}, log10:{arity:1,run:Math.log10},
  log1p:{arity:1,run:Math.log1p}, exp:{arity:1,run:Math.exp}, sqrt:{arity:1,run:Math.sqrt},
  abs:{arity:1,run:Math.abs}, pow:{arity:2,run:Math.pow}, min:{arity:2,run:Math.min}, max:{arity:2,run:Math.max}
});
const constants = Object.freeze({pi:Math.PI,e:Math.E});
const reserved = new Set(['t','T','constructor','prototype',...Object.keys(functions),...Object.keys(constants)]);
export function validateVariables(variables) {
  if(!Array.isArray(variables)||variables.length>24)throw new ExpressionError('Defina no máximo 24 coeficientes.');
  const names=new Set();
  for(const v of variables){
    if(!v||typeof v.name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(v.name)||reserved.has(v.name))throw new ExpressionError(`Nome de variável inválido ou reservado: ${v?.name??''}. Use letras, números e sublinhado; t e T são entradas fixas.`);
    if(names.has(v.name))throw new ExpressionError(`Variável repetida: ${v.name}.`);names.add(v.name);
    if([v.default_value,v.min_value,v.max_value].some(n=>!Number.isFinite(n)||Math.abs(n)>1e12)||v.min_value>v.max_value||v.default_value<v.min_value||v.default_value>v.max_value)throw new ExpressionError(`Padrão e limites inválidos para ${v.name}.`);
    if(typeof v.label!=='string'||v.label.length>100||typeof v.unit!=='string'||v.unit.length>40)throw new ExpressionError(`Rótulo ou unidade inválida para ${v.name}.`);
  }
  return variables;
}
const cache=new Map();
export function compileExpression(expression, variableNames) {
  if(typeof expression!=='string'||!expression.trim()||expression.length>500)throw new ExpressionError('A expressão deve ter entre 1 e 500 caracteres.');
  const source=expression.replaceAll('×','*').replaceAll('÷','/').replaceAll('−','-').replaceAll('π','pi').trim();
  const key=JSON.stringify([source,variableNames]);if(cache.has(key))return cache.get(key);
  const allowed=new Set(['t','T',...variableNames]),tokens=[];
  for(let position=0;position<source.length;){
    if(/\s/.test(source[position])){position++;continue;}
    const rest=source.slice(position),number=rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if(number){const value=Number(number[0]);if(!Number.isFinite(value))throw new ExpressionError('Constante numérica não finita.');tokens.push({kind:'number',value,position});position+=number[0].length;}
    else {const id=rest.match(/^[A-Za-z][A-Za-z0-9_]*/);if(id){tokens.push({kind:'id',value:id[0],position});position+=id[0].length;}
      else if('+-*/^(),'.includes(source[position])){tokens.push({kind:source[position],position});position++;}
      else throw new ExpressionError(`Caractere não permitido na posição ${position+1}: ${source[position]}.`);}
    if(tokens.length>200)throw new ExpressionError('Expressão complexa demais (máximo de 200 símbolos).');
  }
  tokens.push({kind:'end',position:source.length});let index=0,nodes=0;
  function node(data){if(++nodes>128)throw new ExpressionError('Expressão complexa demais (máximo de 128 operações e termos).');return data;}
  function take(kind){const token=tokens[index];if(token.kind!==kind)throw new ExpressionError(`Esperado “${kind}” na posição ${token.position+1}.`);index++;return token;}
  function parse(minimum=0,depth=0){
    if(depth>32)throw new ExpressionError('Expressão aninhada demais (máximo de 32 níveis).');
    const token=tokens[index++];let left;
    if(token.kind==='number')left=node({kind:'number',value:token.value});
    else if(token.kind==='+'||token.kind==='-')left=node({kind:'unary',operator:token.kind,value:parse(25,depth+1)});
    else if(token.kind==='('){left=parse(0,depth+1);take(')');}
    else if(token.kind==='id'){
      if(tokens[index].kind==='('){
        if(!Object.hasOwn(functions,token.value))throw new ExpressionError(`Função não permitida: ${token.value}.`);
        take('(');const args=[parse(0,depth+1)];while(tokens[index].kind===','){take(',');args.push(parse(0,depth+1));if(args.length>2)throw new ExpressionError('Funções aceitam no máximo dois argumentos.');}take(')');
        if(args.length!==functions[token.value].arity)throw new ExpressionError(`A função ${token.value} exige ${functions[token.value].arity} argumento(s).`);
        left=node({kind:'call',name:token.value,args});
      }else if(Object.hasOwn(constants,token.value))left=node({kind:'number',value:constants[token.value]});
      else if(allowed.has(token.value))left=node({kind:'variable',name:token.value});
      else throw new ExpressionError(`Variável não declarada: ${token.value}.`);
    }else throw new ExpressionError(`Termo matemático inválido na posição ${token.position+1}.`);
    const binding={'+':10,'-':10,'*':20,'/':20,'^':30};
    while(Object.hasOwn(binding,tokens[index].kind)&&binding[tokens[index].kind]>=minimum){
      const operator=tokens[index++].kind,priority=binding[operator];
      left=node({kind:'binary',operator,left,right:parse(operator==='^'?priority:priority+1,depth+1)});
    }
    return left;
  }
  const ast=parse();take('end');
  function evaluate(context){
    function visit(n){
      let value;
      if(n.kind==='number')value=n.value;
      else if(n.kind==='variable'){if(!Object.hasOwn(context,n.name)||!Number.isFinite(context[n.name]))throw new ExpressionError(`Valor numérico ausente para ${n.name}.`);value=context[n.name];}
      else if(n.kind==='unary')value=(n.operator==='-'?-1:1)*visit(n.value);
      else if(n.kind==='call')value=functions[n.name].run(...n.args.map(visit));
      else {const a=visit(n.left),b=visit(n.right);switch(n.operator){case '+':value=a+b;break;case '-':value=a-b;break;case '*':value=a*b;break;case '/':value=a/b;break;case '^':value=a**b;break;}}
      if(!Number.isFinite(value))throw new ExpressionError('A expressão produziu um valor não finito. Confira divisões, raízes, logaritmos e potências.');
      return value;
    }
    return visit(ast);
  }
  const compiled={source,evaluate};if(cache.size>=256)cache.delete(cache.keys().next().value);cache.set(key,compiled);return compiled;
}
export function validateFamilyDefinition(definition){
  validateVariables(definition.variables);
  if(!['mm_min','mm_h'].includes(definition.default_unit))throw new ExpressionError('Unidade de resultado inválida.');
  compileExpression(definition.expression,definition.variables.map(v=>v.name));return definition;
}
export function validateFamilyParameters(definition,parameters){
  if(!parameters||typeof parameters!=='object'||Array.isArray(parameters)||Object.keys(parameters).length!==definition.variables.length)throw new ExpressionError('Os coeficientes devem corresponder exatamente às variáveis da família.');
  for(const v of definition.variables)if(!Object.hasOwn(parameters,v.name)||!Number.isFinite(parameters[v.name])||parameters[v.name]<v.min_value||parameters[v.name]>v.max_value)throw new ExpressionError(`Informe ${v.name} entre ${v.min_value} e ${v.max_value}.`);
}
export function evaluateExpressionFamily(definition,parameters,t,T){
  validateFamilyParameters(definition,parameters);
  return compileExpression(definition.expression,definition.variables.map(v=>v.name)).evaluate({...parameters,t,T});
}
