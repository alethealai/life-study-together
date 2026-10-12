import {ArrowUpRight} from 'lucide-react';
import {nextReadingLink} from '@/lib/reading-links.mjs';

export default function StartReading({kind,book,completed}:{kind:string;book:string;completed:number}) {
  const link = nextReadingLink(kind,book,completed);
  if (!link) return null;
  return <a className="outline start-reading" href={link.href} target="_blank" rel="noopener noreferrer"
    aria-label={`${link.direct?'開始讀吧！':'開啟目錄'} ${link.description}`}>
    {link.direct?'開始讀吧！':'開啟生命讀經目錄'}<ArrowUpRight size={16}/>
  </a>;
}
