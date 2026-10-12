export {EMOJIS,BOOKS,CHAPTERS} from "../functions/src/catalog.mjs";
export type Member={streakEndDate?:string|null;streakLength?:number;inventoryRevision?:number;id:string;name:string;baseBible:number;baseLife:number;archivedBibleRead?:number;archivedLifeRead?:number;bibleProgress?:number;lifeProgress?:number;bibleRead?:number;lifeRead?:number;revision?:number;logCount?:number;lastReadDate?:string|null;baseCwwl?:number;cwwlProgress?:number;cwwlRead?:number;archivedCwwlRead?:number};
export type Log={id:string;member:string;date:string;bible:number;life:number;note:string;book?:string;lifeBook?:string;cwwl?:number;cwwlBook?:string};
export type Reward={placement?:boolean;id:string;member:string;emoji:string|null;source:string;date:string;x:number|null;y:number|null};
export type Garden={hasPlacedEmoji?:boolean;placementRevision?:number;members:Member[];logs:Log[];rewards:Reward[];plan:{book:string;lifeBook:string;bibleTarget:number;lifeTarget:number;bibleStep:number;lifeStep:number;revision?:number;readingStarted?:boolean;enabledTracks?:string[];cwwlBookId?:string|null;cwwlTarget?:number}};
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
export function shiftDate(s:string,n:number){return new Date(Date.parse(s+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)}
export function initial():Garden{return {members:[],logs:[],rewards:[],plan:{book:'約翰福音',lifeBook:'約翰福音',bibleTarget:6,lifeTarget:16,bibleStep:3,lifeStep:3}}}
export function progress(g:Garden,id:string){const m=g.members.find(m=>m.id===id);return {bible:m?.bibleProgress??m?.baseBible??0,life:m?.lifeProgress??m?.baseLife??0,bibleRead:m?.bibleRead??0,lifeRead:m?.lifeRead??0}}
export function streak(g:Garden,id:string){const m=g.members.find(m=>m.id===id),end=m?.streakEndDate;return end&&(end===today()||end===shiftDate(today(),-1))?m?.streakLength??0:0}
