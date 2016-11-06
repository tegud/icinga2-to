module.exports = function(config) {
    const transformers = {
        'status-change': message => new Promise(resolve => {
            const state = message.data;
            const title = `Icinga Check: ${state.host.name}/${state.service.name} is now ${state.state.status}`;
            const description = `Icinga alert for: ${state.host.name}, ${state.service.name}\r\n${state.output}`;

            resolve({
                type: 'zendesk-ticket',
                data: {
                    subject: title,
                    description: description
                }
            });
        })
    };

    return message => {
        if(!transformers[message.type]) {
            console.log(`Unmatched message type for transform to zendesk-incident: ${message.type}`);
            console.log(message);
            return new Promise(resolve => resolve(message));
        }

        return transformers[message.type](message);
    };
};
