export const profile='linkedin.com/in/auriel-wetherall-77a2192a9',selfName='David Prince DHyp Psych. Ph.D (c)',org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',actor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',sourceId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const contact={id:JSON.stringify([org,'linkedin:'+profile]),identity:profile,name:'Auriel Wetherall'};
export const messages=[
 ['Wednesday','11:25 AM',selfName,'Hi Auriel, thanks for connecting. My work focuses on workplace wellbeing and how organisations measure whether their wellbeing initiatives are actually making a difference.'],
 ['Wednesday','11:28 AM','Auriel Wetherall',"Hi David\n\nThat's great to hear, it would be great to have a chat sometime to explore this with you."],
 ['Wednesday','11:30 AM',selfName,'Hi Auriel,\nThanks for coming back to me. I would love that. Let me know when you are free and I will give you a call if you like.'],
 ['Thursday','3:12 PM','Auriel Wetherall',"Hi David\n\nApologies I didn't message you back, what is your schedule looking like for next week?\n\nAuriel"],
 ['Thursday','3:44 PM',selfName,'No problem Auriel, I am around on Tuesday fairly flexible and also Thursday at either 11am or 3pm, how does that sound to you?'],
 ['Friday','3:54 PM','Auriel Wetherall','Hi David\n\nTuesday is good for me, how does 1pm sound?\n\nZoom/WhapApp call?\n\nHave a good weekend speak soon\n\nAuriel'],
 ['Friday','3:57 PM',selfName,"I do have zoom, but prefer whatsapp if that's ok? ... and 1pm is perfect thanks"],
 ['Friday','4:21 PM','Auriel Wetherall','That all Good I will call you on WhatsApp'],
 ['Friday','4:22 PM',selfName,'Fantastic, I am looking forward to meeting you Auriel']
];
export const paste=`Auriel Wetherall ProfileStatus is reachable\nAuriel Wetherall\n(She/Her)\n1st degree connection\nhttps://${profile}\n`+messages.map(([day,time,name,body],i)=>`${i===0||messages[i-1][0]!==day?day+'\n':''}${name} sent the following message at ${time}\nView ${name}’s profile${name}\n${name}${name==='Auriel Wetherall'?' (She/Her)':''}  ${time}\n${i===4?'👏\n👍\n😊\n':''}${body}\n\n`).join('')+'Seen by Auriel Wetherall at 4:22 PM.\nAuriel Wetherall sent the following message at 4:23 PM\n👍\n';
export const options={referenceDate:'2026-10-25',weekConfirmed:true,contactName:contact.name,selfNames:[selfName]};
