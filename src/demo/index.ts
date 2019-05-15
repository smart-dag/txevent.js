import SDAGEvent from '../index';

async function demo() {
    let mn = 'sea absorb guilt regular retire fire invest urge tone peace enroll asthma';
    let watcher = new SDAGEvent();
    await watcher.connect('ws://10.168.3.131:6615');
    watcher.watch(['6CW76VRWSSGIVXGVUTWAAEFU23UOZQCT']).on('in', (obj) => { }).on('out', (obj) => { });
}