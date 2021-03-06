const stateColours = {
    'OK': 'good',
    'WARNING': 'warning',
    'CRITICAL': {
        'HARD': 'danger',
        'SOFT': '#E8723C'
    },
    'UNKNOWN': '#a4f'
};

const stateTypeFriendlyText = {
    'SOFT': 'Pending',
    'HARD': 'Confirmed'
};

function getStateColour(state) {
    if(typeof stateColours[state.status] === 'string') {
        return stateColours[state.status];
    }

    return stateColours[state.status][state.statusType];
}

function getStatusText(state){
    if(state.status === 'OK') {
        return state.status;
    }

    return `${state.status} (${stateTypeFriendlyText[state.statusType]})`;
}

module.exports = function(config) {
    const transformers = {
        'icinga-dead': message => new Promise(resolve => {
            const state = message.data;
            const text = state.status === 'ok' ? 'Icinga 2 is back!' : 'Icinga 2 is down!';
            const fields = [];

            if(message.data.message) {
                fields.push({ title: 'Reason', value: message.data.message });
            }

            const slackAttachments = [{
                fallback: text,
                text: text,
                color: state.status === 'ok' ? 'good' : 'danger',
                fields: fields
            }];

            resolve({
                type: 'hubot-slack',
                data: {
                    slack: config.slackProject,
                    channels: state.channels || config.channels,
                    attachments: slackAttachments
                }
            });
        }),
        'status-change': message => new Promise(resolve => {
            const state = message.data;
            const text = state.output;
            const statusPendingText = getStatusText(state.state);
            const title = `Icinga Check: ${state.host.name}/${state.service.name} is now ${statusPendingText}`;

            const fields = [
                { title: 'Host', value: state.host.name, short: true },
                { title: 'Service', value: state.service.name, short: true }
            ];

            if(state.state.status !== 'OK') {
                let attemptsText = '';

                if(state.state.statusType === 'HARD') {
                    attemptsText = 'Confirmed';

                    if(state.previousState) {
                        const afterTries = state.previousState.attempt + 1;
                        attemptsText += ` after ${afterTries} attempt${afterTries === 1 ? '' : 's'}`
                    }
                }
                else {
                    attemptsText = `${state.state.attempt} (Pending)`;
                }

                fields.push({
                    title: 'Attempt',
                    value: attemptsText,
                    short: true
                })
            }

            if(state.previousState) {
                fields.push({
                    title: 'Previous State',
                    value: getStatusText(state.previousState),
                    short: true
                });
            }

            const slackAttachments = [{
                fallback: `${title}\r\n${text}`,
                title: title,
                text: text,
                color: getStateColour(state.state),
                fields: fields
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
            console.log(`Unmatched message type for transform to hubot-slack: ${message.type}`);
            console.log(message);
            return new Promise(resolve => resolve(message));
        }

        return transformers[message.type](message)
    };
};
