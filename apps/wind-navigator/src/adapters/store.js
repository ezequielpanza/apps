const values = new Map();
export default { get(key){ return values.get(key); }, set(key,value){ values.set(key,value); return true; } };
