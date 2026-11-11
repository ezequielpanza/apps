// Android rotation matrix maps phone coordinates (screen right, screen top,
// out of the screen) into east, magnetic north, up.
const frames={
 horizontal:{0:[[0,1,0],[0,0,1]],90:[[1,0,0],[0,0,1]],180:[[0,-1,0],[0,0,1]],270:[[-1,0,0],[0,0,1]]},
 vertical:{0:[[0,0,-1],[0,1,0]],90:[[1,0,0],[0,1,0]],180:[[0,0,1],[0,1,0]],270:[[-1,0,0],[0,1,0]]}
};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mul=(m,v)=>[0,1,2].map(i=>m[3*i]*v[0]+m[3*i+1]*v[1]+m[3*i+2]*v[2]);
export function boatOrientation(matrix,position,bow){
 if(!Array.isArray(matrix)||matrix.length!==9||!matrix.every(Number.isFinite))return null;
 const basis=frames[position]?.[bow];if(!basis)return null;
 const [forward,up]=basis,right=cross(forward,up),f=mul(matrix,forward),r=mul(matrix,right),u=mul(matrix,up),rad=180/Math.PI;
 const horizontal=Math.hypot(f[0],f[1]);if(horizontal<1e-6)return null;
 return {level:u[2],heading:(Math.atan2(f[0],f[1])*rad+360)%360,pitch:-Math.atan2(f[2],horizontal)*rad,roll:-Math.atan2(r[2],u[2])*rad};
}
