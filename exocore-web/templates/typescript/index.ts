type Greeting = {
    name: string;
    timestamp: Date;
};

const greet = (name: string): Greeting => ({
    name,
    timestamp: new Date(),
});

const message = greet("Exocore");

console.log(`Hello, ${message.name}!`);
console.log(`Started at: ${message.timestamp.toISOString()}`);

export { greet, type Greeting };
