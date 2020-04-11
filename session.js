var fs = require('fs');
const { v4: uuidv4 } = require('uuid');

module.exports.getUser = function getUser(request, response) {
    var userId = request.cookies['user-id'];

    if (userId) {
        return { 
            id: userId,
            name: this.getUserName(userId)
        };
    }

    userId = uuidv4();
    var farFuture = new Date(new Date().getTime() + (1000*60*60*24*365*10)); // ~10y
    response.cookie('user-id', userId, { maxAge: farFuture, httpOnly: true });
    return {
        id: userId,
        name: this.getUserName(userId)
    }
}

module.exports.getUserName = function getUserName(userId) {
    var filename = './users.json';
    var users = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename)) : {};

    return users[userId] ? users[userId].name : 'Unknown';
}

module.exports.setUserName = function (request, response, name) {
    var filename = './users.json';
    var users = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename)) : {};
    var user = this.getUser(request, response);

    users[user.id] = {
        name: name
    };

    fs.writeFileSync(filename, JSON.stringify(users));
    return this.getUser(request, response);
}