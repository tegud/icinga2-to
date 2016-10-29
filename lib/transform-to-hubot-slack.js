module.exports = function(config) {
    const transformers = {
        'icinga-dead': message => new Promise(resolve => {
            const state = message.data;
            const text = state.status === 'ok' ? 'Icinga 2 is back!' : 'Icinga 2 is down!';
            const slackAttachments = [{
                fallback: text,
                text: text,
                color: state.status === 'ok' ? 'good' : 'danger'
            }];

            resolve({
                type: 'hubot-slack',
                data: {
                    slack: config.slackProject,
                    channels: state.channels || config.channels,
                    attachments: slackAttachments
                }
            });
        })
    };

    return message => {
        if(!transformers[message.type]) {
            return message;
        }

        return transformers[message.type](message)
    };
};
