var fs = require('fs');
import { TxLength, TxDetailIdx } from './codec/tx_data';
import { TxType } from './common';
function main() {
  var obj = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  for (let i = 0; i < obj.txsType.length; i++) {
    console.log('Tx', i);
    console.log('type:', TxType[obj.txsType[i]]);
    for (var enumStr of Object.values(TxDetailIdx)) {
      if (typeof enumStr == 'string') {
        const enumIdx = TxDetailIdx[enumStr];
        const value = obj.encodedTxs[i][enumIdx];
        console.log(enumStr, ':', value);
      }
    }
    console.log('\n');
  }
}
main();
