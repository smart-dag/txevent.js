# SDAGEvent

SDAG Tx Watcher

### Installation

```
npm i sdagevent.js
```

### Usage 

```javascript
import SDAGEvent, { InOutMessage } from 'sdagevent.js';

async function demo() {
    let watcher = new SDAGEvent();
    await watcher.connect('ws://10.168.3.131:6615');
    watcher.watch(['6CW76VRWSSGIVXGVUTWAAEFU23UOZQCT']).on('in', (obj: InOutMessage) => { console.log('in', obj) }).on('out', (obj: InOutMessage) => { console.log('out', obj) });
}

demo();
```

### License

MIT