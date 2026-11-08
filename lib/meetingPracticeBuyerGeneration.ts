export type PracticeBuyerFailureClass='provider_timeout'|'provider_rate_limited'|'provider_unavailable'|'provider_connection_failed'|'provider_request_failed'|'provider_rejected_request'|'unexpected_response_shape'|'empty_output'|'malformed_output'|'validation_rejection';
export type PracticeBuyerRetryResult='not_scheduled'|'scheduled'|'succeeded'|'failed'|'not_applicable';
export type PracticeBuyerAttemptDiagnostic={attempt:number;durationMs:number;failureClass:PracticeBuyerFailureClass|null;recoverable:boolean;retryScheduled:boolean;retryResult:PracticeBuyerRetryResult;sellerTurnId:string;navigationCommitted:false};
export type PracticeBuyerGenerationDiagnostic={sellerTurnId:string;navigationCommitted:false;attempts:PracticeBuyerAttemptDiagnostic[]};
type PracticeBuyerGenerationResponse={text:string;usageTokens:number;diagnostic:PracticeBuyerGenerationDiagnostic};

type Failure={failureClass:PracticeBuyerFailureClass;recoverable:boolean;usageTokens?:number};
const transientCodes=new Set(['ETIMEDOUT','ECONNABORTED','ECONNRESET','ECONNREFUSED','EAI_AGAIN','ENOTFOUND','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET']);
function classifyProviderFailure(error:unknown):Failure{
 const value=error&&typeof error==='object'?error as Record<string,unknown>:{};
 const status=typeof value.status==='number'?value.status:typeof value.statusCode==='number'?value.statusCode:null;
 const name=typeof value.name==='string'?value.name:'';
 const code=typeof value.code==='string'?value.code:'';
 const cause=value.cause&&typeof value.cause==='object'?value.cause as Record<string,unknown>:{};
 const causeCode=typeof cause.code==='string'?cause.code:'';
 if(status===408||name==='TimeoutError'||name==='AbortError'||name==='APIConnectionTimeoutError'||code==='ETIMEDOUT'||causeCode==='ETIMEDOUT')return {failureClass:'provider_timeout',recoverable:true};
 if(status===429)return {failureClass:'provider_rate_limited',recoverable:true};
 if(status!==null&&status>=500)return {failureClass:'provider_unavailable',recoverable:true};
 if(transientCodes.has(code)||transientCodes.has(causeCode)||name==='APIConnectionError')return {failureClass:'provider_connection_failed',recoverable:true};
 if(status!==null&&status>=400)return {failureClass:'provider_rejected_request',recoverable:false};
 return {failureClass:'provider_request_failed',recoverable:false};
}
function parseFailure(response:unknown,valid:(text:string)=>boolean):{text:string;usageTokens:number}|Failure{
 const root=response&&typeof response==='object'?response as Record<string,unknown>:{},usage=root.usage&&typeof root.usage==='object'?root.usage as Record<string,unknown>:{},usageTokens=typeof usage.total_tokens==='number'&&Number.isFinite(usage.total_tokens)&&usage.total_tokens>0?Math.floor(usage.total_tokens):0;
 const choices=root.choices;
 if(!Array.isArray(choices)||!choices.length||!choices[0]||typeof choices[0]!=='object')return {failureClass:'unexpected_response_shape',recoverable:true,usageTokens};
 const message=(choices[0] as Record<string,unknown>).message;
 if(!message||typeof message!=='object'||!('content'in message))return {failureClass:'unexpected_response_shape',recoverable:true,usageTokens};
 const content=(message as Record<string,unknown>).content;
 if(content===null||content===undefined||content==='')return {failureClass:'empty_output',recoverable:true,usageTokens};
 if(typeof content!=='string')return {failureClass:'unexpected_response_shape',recoverable:true,usageTokens};
 if(!content.trim())return {failureClass:'empty_output',recoverable:true,usageTokens};
 let parsed:unknown;
 try{parsed=JSON.parse(content);}catch{return {failureClass:'malformed_output',recoverable:true,usageTokens};}
 const text=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?(parsed as Record<string,unknown>).text:undefined;
 if(typeof text!=='string'||!valid(text))return {failureClass:'validation_rejection',recoverable:true,usageTokens};
 return {text,usageTokens};
}

export class PracticeBuyerGenerationFailure extends Error{
 readonly diagnostics:PracticeBuyerGenerationDiagnostic;
 readonly usageTokens:number;
 constructor(diagnostics:PracticeBuyerGenerationDiagnostic,usageTokens:number){super('Alex could not respond after two attempts. The verified seller turn and transcript are retained; no buyer turn or navigation was committed.');this.name='PracticeBuyerGenerationFailure';this.diagnostics=diagnostics;this.usageTokens=usageTokens;}
}

export async function generatePracticeBuyerResponse(input:{sellerTurnId:string;request:()=>Promise<unknown>;isValidBuyerText:(text:string)=>boolean;now?:()=>number}):Promise<PracticeBuyerGenerationResponse>{
 const now=input.now||Date.now,diagnostic:PracticeBuyerGenerationDiagnostic={sellerTurnId:input.sellerTurnId,navigationCommitted:false,attempts:[]};let usageTokens=0;
 for(let attempt=1;attempt<=2;attempt++){
  const startedAt=now();let failure:Failure|null=null,response:unknown;
  try{response=await input.request();}catch(error){failure=classifyProviderFailure(error);}
  let parsed:{text:string;usageTokens:number}|Failure|undefined;
  if(!failure){parsed=parseFailure(response,input.isValidBuyerText);if('failureClass'in parsed){failure=parsed;usageTokens+=parsed.usageTokens||0;}else usageTokens+=parsed.usageTokens;}
  const recoverable=failure?.recoverable===true,retryScheduled=attempt===1&&recoverable;
  const entry:PracticeBuyerAttemptDiagnostic={attempt,durationMs:Math.max(0,now()-startedAt),failureClass:failure?.failureClass||null,recoverable,retryScheduled,retryResult:retryScheduled?'scheduled':attempt===1?'not_scheduled':'not_applicable',sellerTurnId:input.sellerTurnId,navigationCommitted:false};
  diagnostic.attempts.push(entry);
  if(!failure&&parsed&&!('failureClass'in parsed)){
   if(attempt===2&&diagnostic.attempts[0])diagnostic.attempts[0].retryResult='succeeded';
   return {text:parsed.text,usageTokens,diagnostic};
  }
  if(!retryScheduled){if(attempt===2&&diagnostic.attempts[0]?.retryScheduled)diagnostic.attempts[0].retryResult='failed';throw new PracticeBuyerGenerationFailure(diagnostic,usageTokens);}
 }
 throw new PracticeBuyerGenerationFailure(diagnostic,usageTokens);
}
