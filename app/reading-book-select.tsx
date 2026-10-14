import {BOOKS} from '@/lib/garden';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';

export default function ReadingBookSelect({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) {
  // Keep legacy names exactly as stored: opening or saving the form must not
  // accidentally start a new reading period by normalizing an existing name.
  const choices=value&&!BOOKS.includes(value)?[value,...BOOKS]:BOOKS;
  return <label>{label}
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full rounded-full mt-2 h-12"><SelectValue/></SelectTrigger>
      <SelectContent className="rounded-3xl">
        {choices.map(book=><SelectItem key={book} value={book}>{book}</SelectItem>)}
      </SelectContent>
    </Select>
  </label>;
}
