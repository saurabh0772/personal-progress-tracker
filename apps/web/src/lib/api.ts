const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
export async function api<T>(path:string, init:RequestInit={}):Promise<T>{
  const response=await fetch(`${API_BASE_URL}${path}`,{...init,credentials:'include',headers:{'Content-Type':'application/json',...init.headers}});
  if(response.status===204)return undefined as T;
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body?.error?.message??'Request failed');
  return body as T;
}
