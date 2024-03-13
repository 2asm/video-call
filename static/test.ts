let x: Number = 44
console.log(`HI ${x}`)

const clone = (o: Object) => JSON.parse(JSON.stringify(o))

let arr: Number[] = [1, 2, 4]
let arr2: Number[] = clone(arr)

console.log(arr, arr2)


