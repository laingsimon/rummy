module.exports.Random = class Random {
    next = (min, max) => {
        return Math.floor(Math.random() * (max - min) + min);
    } 
}