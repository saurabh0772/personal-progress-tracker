const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
export async function api<T>(path:string, init:RequestInit={}):Promise<T>{
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('ppt_token') : null;
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response=await fetch(`${API_BASE_URL}${path}`,{...init,credentials:'include',headers});
  if(response.status===204)return undefined as T;
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body?.error?.message??'Request failed');
  return body as T;
}
