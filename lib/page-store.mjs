// One store per signed-in user / active garden. No localStorage or global private cache.
export function createPageStore(fetchPage, ttl = 60000) {
  let state = {rows:[], busy:false, loaded:false, more:true, error:''};
  let cursor = null, version, updatedAt = 0, generation = 0, pending;
  const listeners = new Set();
  const emit = patch => {state = {...state,...patch}; for (const fn of listeners) fn();};
  async function load(reset) {
    if (pending && !reset) return pending;
    if (!reset && state.loaded && !state.more) return;
    const token = reset ? ++generation : generation;
    if (reset) cursor = null;
    emit({busy:true,error:'',...(reset ? {rows:[],loaded:false,more:true} : {})});
    const work = (async () => {
      try {
        const page = await fetchPage(cursor);
        if (token !== generation) return;
        const rows = reset ? page.rows : [...state.rows,...page.rows];
        emit({rows:[...new Map(rows.map(row=>[row.id,row])).values()],loaded:true,more:page.more});
        cursor = page.cursor; updatedAt = Date.now();
      } catch {
        if (token === generation) emit({error:'無法載入，請重試。'});
      } finally {
        if (token === generation) {pending = null; emit({busy:false});}
      }
    })();
    pending = work;
    return work;
  }
  return {
    subscribe(fn) {listeners.add(fn); return ()=>listeners.delete(fn);},
    getSnapshot:()=>state,
    ensure(nextVersion) {
      if (version !== nextVersion) {version=nextVersion; return load(true);}
      if (pending) return pending;
      if (!state.loaded || Date.now()-updatedAt > ttl) return load(true);
    },
    more:()=>load(false),
    refresh:()=>load(true),
  };
}
