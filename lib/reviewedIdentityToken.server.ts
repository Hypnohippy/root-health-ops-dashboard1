import { createHmac, timingSafeEqual } from "node:crypto";
import type { ReviewedDecision } from "@/lib/reviewedIdentity";

function signature(value:string, secret:string) { return createHmac("sha256", secret).update("reviewed-identity-v1:" + value).digest("base64url"); }
export function sealIdentityReview(value:ReviewedDecision,secret:string) {
 if (!secret) throw Error("Reviewed decision signing unavailable.");
 const encoded = Buffer.from(JSON.stringify(value)).toString("base64url");
 return encoded + "." + signature(encoded,secret);
}
export function openIdentityReview(token:unknown,secret:string,org:string,actor:string,now=Date.now()):ReviewedDecision {
 if (!secret || typeof token !== "string" || token.length > 220000) throw Error("Review unavailable.");
 const parts=token.split("."); if(parts.length!==2)throw Error("Review unavailable.");
 const expected=Buffer.from(signature(parts[0],secret)),actual=Buffer.from(parts[1]);
 if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw Error("Review unavailable.");
 const value=JSON.parse(Buffer.from(parts[0],"base64url").toString()) as ReviewedDecision;
 if(value.version!==1||value.organisationId!==org||value.actor!==actor||!Number.isFinite(value.expiresAt)||value.expiresAt<now)throw Error("Review expired or unavailable. Review again.");
 return value;
}
