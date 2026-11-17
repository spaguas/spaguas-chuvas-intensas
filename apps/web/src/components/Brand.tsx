import { Droplet } from 'lucide-react';
export default function Brand({logoUrl}:{logoUrl:string|null}){
 return logoUrl?<img className="brand-logo" src={logoUrl} alt="Logotipo do sistema"/>:<><Droplet size={31} strokeWidth={1.7}/><strong>SP <span>ÁGUAS</span></strong></>;
}
