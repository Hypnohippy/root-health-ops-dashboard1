import { object, words, type Row } from "@/lib/relationshipWorkspace";
export const valueMethods=["per_employee","per_seat","monthly_retainer","annual_contract","one_off_project","revenue_share","manual_estimate","custom"] as const;
export type ValueMethod=typeof valueMethods[number];
export type ValueInput={method:ValueMethod;currency:string;totalEmployees:number|null;eligibleEmployees:number|null;expectedQuantity:number|null;standardRate:number|null;expectedRate:number|null;discountPercent:number;revenueBasis:number|null;sharePercent:number|null;potentialManual:number|null;expectedManual:number|null;oneOffPotential:number|null;oneOffExpected:number|null;basis:string;quantitySource:string;priceSource:string;pricingModelId:string|null;pricingVersion:number|null;services:{label:string;source:string;potential:number|null;expected:number|null}[]};
const numeric=(v:unknown,label:string,integer=false):number|null=>{if(v===null||v===undefined||v==="")return null;if(!["number","string"].includes(typeof v))throw Error(`${label} must be a number.`);const n=Number(v);if(!Number.isFinite(n)||n<0||n>1e12||integer&&!Number.isSafeInteger(n))throw Error(`${label} must be a valid non-negative ${integer?"whole number":"amount"}.`);return n;};
export function valueInput(raw:Row):ValueInput {
 const m=words(raw.method);if(!valueMethods.includes(m as ValueMethod))throw Error("Choose a supported value method.");
 const currency=words(raw.currency)||"GBP";if(!/^[A-Z]{3}$/.test(currency))throw Error("Use an ISO currency code.");try{new Intl.NumberFormat("en-GB",{style:"currency",currency});}catch{throw Error("Invalid currency.");}
 const services=Array.isArray(raw.services)?raw.services.map(value=>{const r=object(value);if(!words(r.label)||!words(r.source))throw Error("Describe each additional service and its pricing source.");return {label:words(r.label),source:words(r.source),potential:numeric(r.potential,"Service potential"),expected:numeric(r.expected,"Service expected")};}):[];if(services.length>30)throw Error("Use at most 30 additional services.");
 const result:ValueInput={services,method:m as ValueMethod,currency,totalEmployees:numeric(raw.totalEmployees,"Total employees",true),eligibleEmployees:numeric(raw.eligibleEmployees,"Eligible quantity",true),expectedQuantity:numeric(raw.expectedQuantity,"Expected quantity",true),standardRate:numeric(raw.standardRate,"Standard rate"),expectedRate:numeric(raw.expectedRate,"Negotiated rate"),discountPercent:numeric(raw.discountPercent,"Discount")??0,revenueBasis:numeric(raw.revenueBasis,"Revenue basis"),sharePercent:numeric(raw.sharePercent,"Revenue share"),potentialManual:numeric(raw.potentialManual,"Potential estimate"),expectedManual:numeric(raw.expectedManual,"Expected estimate"),oneOffPotential:numeric(raw.oneOffPotential,"One-off potential"),oneOffExpected:numeric(raw.oneOffExpected,"One-off expected"),basis:words(raw.basis),quantitySource:words(raw.quantitySource),priceSource:words(raw.priceSource),pricingModelId:words(raw.pricingModelId)||null,pricingVersion:numeric(raw.pricingVersion,"Pricing version",true)};
 if(services.length){result.oneOffPotential=services.every(x=>x.potential!==null)?services.reduce((sum,x)=>sum+x.potential!,0):null;result.oneOffExpected=services.every(x=>x.expected!==null)?services.reduce((sum,x)=>sum+x.expected!,0):null;}
 if(result.discountPercent>100||(result.sharePercent??0)>100)throw Error("Percentages cannot exceed 100%.");
 if(result.expectedRate!==null&&result.discountPercent!==0)throw Error("Use a negotiated rate OR a discount, not both.");
 if(result.method==="per_employee" && result.totalEmployees!==null && result.eligibleEmployees!==null && result.eligibleEmployees>result.totalEmployees)throw Error("Eligible employees cannot exceed total employees.");
 if(result.eligibleEmployees!==null&&result.expectedQuantity!==null&&result.expectedQuantity>result.eligibleEmployees)throw Error("Expected coverage cannot exceed full eligible scope.");
 if(JSON.stringify(result).length>12000)throw Error("Value basis is too long.");return result;
}
const round=(n:number|null)=>n===null?null:Math.round((n+Number.EPSILON)*100)/100;
export function calculateValue(raw:Row) {
 const i=valueInput(raw), quantity=i.eligibleEmployees, rate=i.standardRate, actualRate=i.expectedRate??(rate===null?null:rate*(1-i.discountPercent/100));let potential:number|null=null,expected:number|null=null,potentialBasis="Not established",expectedBasis="Not established",recurring=true;
 if(["per_employee","per_seat"].includes(i.method)) {
  const unit=i.method==="per_employee"?"eligible employees":"seats";
  if(quantity!==null&&rate!==null&&i.quantitySource&&i.priceSource){potential=quantity*rate*12;potentialBasis=`${quantity.toLocaleString("en-GB")} ${unit} × ${money(rate,i.currency)}/month × 12`;}
  if(i.expectedQuantity!==null&&actualRate!==null&&i.quantitySource&&i.priceSource){expected=i.expectedQuantity*actualRate*12;expectedBasis=`${i.expectedQuantity.toLocaleString("en-GB")} covered ${i.method==="per_employee"?"employees":"seats"} × ${money(actualRate,i.currency)}/month × 12${i.discountPercent?` (${i.discountPercent}% discount)`:""}`;}
 } else if(["monthly_retainer","annual_contract"].includes(i.method)) {
  const factor=i.method==="monthly_retainer"?12:1;
  if(rate!==null&&i.priceSource){potential=rate*factor;potentialBasis=`${money(rate,i.currency)} × ${factor===12?"12 months":"1 annual contract"}`;}
  if(actualRate!==null&&i.priceSource&&i.basis){expected=actualRate*factor;expectedBasis=`${money(actualRate,i.currency)} × ${factor===12?"12 months":"1 annual contract"}${i.discountPercent?` (${i.discountPercent}% discount)`:""} — ${i.basis}`;}
 } else if(i.method==="revenue_share") {
  if(i.revenueBasis!==null&&i.sharePercent!==null&&i.basis&&i.priceSource){potential=i.revenueBasis*i.sharePercent/100;potentialBasis=`${money(i.revenueBasis,i.currency)} annual revenue basis × ${i.sharePercent}% — ${i.basis}`;}
  if(i.expectedManual!==null&&i.basis){expected=i.expectedManual;expectedBasis=`Explicit annual expected share: ${i.basis}`;}
 } else {recurring=false;if(i.potentialManual!==null&&i.basis){potential=i.potentialManual;potentialBasis=`${i.method.replaceAll("_"," ")}: ${i.basis}`;}if(i.expectedManual!==null&&i.basis){expected=i.expectedManual;expectedBasis=`Explicit expected scope: ${i.basis}`;}}
 const total=(base:number|null,extra:number|null)=>base===null||extra===null?null:round(base+extra);
 for(const n of [potential,expected])if(n!==null&&(!Number.isFinite(n)||n>1e15))throw Error("Calculated value exceeds the supported range.");
 return {input:i,recurring,potential:round(potential),expected:round(expected),potentialBasis,expectedBasis,oneOffPotential:i.oneOffPotential,oneOffExpected:i.oneOffExpected,totalPotential:total(potential,i.oneOffPotential),totalExpected:total(expected,i.oneOffExpected),totalLabel:recurring?"First-year value including one-off services":"Total project value including additional services",discountPercent:i.discountPercent};
}
export function money(n:number|null,currency="GBP") {return n===null?"Not established":new Intl.NumberFormat("en-GB",{style:"currency",currency,maximumFractionDigits:2}).format(n);}
export function pricingDefaults(model:Row|null):Row {if(!model)return {method:"per_employee",currency:"GBP",discountPercent:0};return {...object(model.config),pricingModelId:model.id,pricingVersion:model.version};}
