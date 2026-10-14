// Translate pointer coordinates to the garden's world coordinates. Keep the
// emoji and its confirmation control inside the visible canvas while dragging.
export function draggedPlacement(client, offset, rect, view) {
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const x=clamp(client.x-rect.left+offset.x*view.z,72,Math.max(72,rect.width-72));
  const y=clamp(client.y-rect.top+offset.y*view.z,100,Math.max(100,rect.height-100));
  return {x:view.x+(x-rect.width/2)/view.z,y:view.y+(y-rect.height/2)/view.z};
}
