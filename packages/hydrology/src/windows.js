export const SIBH_WINDOWS = Object.freeze([1,2,3,6,12,24,48,72]);
export function validateSibhHours(hours){
 if(!SIBH_WINDOWS.includes(hours))throw Object.assign(new Error('Janela SIBH inválida. Use 1, 2, 3, 6, 12, 24, 48 ou 72 horas.'),{status:422});
 return hours;
}
