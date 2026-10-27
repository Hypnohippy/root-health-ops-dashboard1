import type {MeetingSegment} from './meetingCopilot';

export type ApparentMeetingAgreement={proposal:MeetingSegment;acceptance:MeetingSegment;timing:string;purpose?:string};

const meetingIntent=/(?:second|another|follow[ -]?up)\s+(?:meeting|call|conversation)|(?:meet|speak|talk|catch up)\s+(?:again|next|later)|appointment|review (?:it|the material|the brief)/i;
const specificTiming=/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december))\b/i;
const exactTime=/\b(?:around|about|at)\s+(?:\d{1,2}(?::\d{2})?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s+o['’]?clock)?(?:\s*(?:a\.?m\.?|p\.?m\.?)?)\b/i;
const timeOfDay=/\b(?:morning|afternoon|evening)\b/i;
const ambiguousTime=/\b(?:sometime|some time|at some point|later)\b/i;
const deliveryDeadline=/\b(?:send|email|share|deliver|forward|provide)\b[^.!?]{0,70}\b(?:by|before|no later than)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december))\b/i;
const affirmative=/^(?:yeah|yes|yep|that works|that would work|works for me|sounds good|agreed|okay|ok|fine by me|perfect)[.! ,]?(?:\s+(?:that works|works for me|sounds good))?[.! ]*$/i;
const refusal=/(?:do not|don't|cannot|can't) (?:want|need) (?:another|a further|any more) (?:meeting|call|conversation)|no need for (?:another|a further) (?:meeting|call|conversation)|not looking to (?:book|schedule) (?:another|a further) (?:meeting|call)/i;

/** A transcript-only review candidate. It deliberately does not assert speakers or a canonical booking. */
export function apparentMeetingAgreement(segments:MeetingSegment[]):ApparentMeetingAgreement|null{
 const speech=segments.filter(segment=>!segment.gap&&segment.text.trim());
 if(speech.some(segment=>refusal.test(segment.text)))return null;
 const meetingWasDiscussedBefore=(index:number)=>speech.slice(0,index+1).some(segment=>meetingIntent.test(segment.text));
 for(let i=0;i<speech.length;i++){
  const proposal=speech[i],text=proposal.text.trim();
  // Specific times qualify directly (for example, “Thursday at 2”). A day with
  // vague timing is still surfaced for human review, never treated as schedulable.
  if(!meetingWasDiscussedBefore(i)||deliveryDeadline.test(text)||!specificTiming.test(text)||!(exactTime.test(text)||timeOfDay.test(text)||ambiguousTime.test(text)))continue;
  for(const acceptance of speech.slice(i+1,i+4)){
   if(affirmative.test(acceptance.text.trim())){
    const timing=[text.match(specificTiming)?.[0],exactTime.exec(text)?.[0]||text.match(timeOfDay)?.[0]||ambiguousTime.exec(text)?.[0]].filter(Boolean).join(' ');
    const purpose=speech.slice(0,i+1).map(segment=>segment.text.match(/\b(?:review|go over|talk through|discuss)\s+(?:the\s+)?(?:short\s+)?(?:information|summary|material|brief|proposal)\b/i)?.[0]).find(Boolean);
    return {proposal,acceptance,timing,purpose};
   }
  }
 }
 return null;
}
