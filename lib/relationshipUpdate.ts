import type { Row } from "@/lib/relationshipWorkspace";
export type SavedRelationshipAction={workspaceId:string;href:string};
/** Persist once, then reread canonical truth. A failed reread retries GET, never another action. */
export async function relationshipUpdate(organisationId:string,locator:string,body:Row,saved:SavedRelationshipAction|null,transport:typeof fetch=fetch) {
 let receipt=saved;
 if(!receipt){const response=await transport(`/api/growth/relationships/${locator}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error(value.error||"Not saved. Your input is retained.");receipt=value as SavedRelationshipAction;}
 try {
  const fresh=await transport(`/api/growth/relationships/workspace_${receipt.workspaceId}?organisationId=${encodeURIComponent(organisationId)}`,{cache:"no-store"});
  if(!fresh.ok)throw Error("Not verified");
  const snapshot=await fresh.json();
  if(snapshot.workspace?.id!==receipt.workspaceId || !Array.isArray(snapshot.recordedActionKeys) || !snapshot.recordedActionKeys.includes(body.key))throw Error("Action is not visible in canonical history");
  return {receipt,snapshot};
 }catch{throw Object.assign(Error("The action was accepted, but the updated record could not be verified. Retry verification; do not record it again."),{receipt});}
}
