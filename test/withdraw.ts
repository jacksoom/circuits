import * as path from 'path';
import { hash } from '../helper.ts/hash';
const Scalar = require('ffjavascript').Scalar;
import { Account } from '../helper.ts/account';
import { hashAccountState, calculateGenesisOrderRoot } from '../helper.ts/state-utils';
import { SimpleTest, TestComponent } from './interface';
import * as common from './common';
import { GlobalState } from './global_state';

// circuit-level definitions
const orderLevels = 2;
const balanceLevels = 2;
const accountLevels = 2;

const genesisOrderRoot = calculateGenesisOrderRoot(orderLevels);

function initTestCase() {
  let state = new GlobalState(balanceLevels, orderLevels, accountLevels, 1);

  const tokenID = 2n;
  const amount = 300n;
  // set sufficient balance to withdraw
  const balance = amount + 1n;
  const nonce = 99n;

  const account = Account.random();
  const accountID = state.createNewAccount();

  // set up account initial state
  state.setAccountKey(accountID, account);
  for (let i = 0; i < 2 ** balanceLevels; i++) {
    if (BigInt(i) == tokenID) {
      state.setTokenBalance(accountID, tokenID, balance);
    } else {
      state.setTokenBalance(accountID, BigInt(i), 10n + BigInt(i));
    }
  }
  state.setAccountNonce(accountID, nonce);
  state.setAccountOrderRoot(accountID, genesisOrderRoot);

  let withdrawTx = {
    accountID: accountID,
    amount: amount,
    tokenID: tokenID,
    signature: null,
  };
  let fullWithdrawTx = state.fillWithdrawTx(withdrawTx);
  let txhash = common.hashWithdraw(fullWithdrawTx);
  withdrawTx.signature = common.accountSign(account, txhash);
  state.Withdraw(withdrawTx);

  let block = state.forge();
  // TODO: assert length
  return {
    enabled: 1,
    accountID: accountID,
    amount: amount,
    tokenID: tokenID,
    nonce: nonce,
    sigL2Hash: txhash,
    s: withdrawTx.signature.S,
    r8x: withdrawTx.signature.R8x,
    r8y: withdrawTx.signature.R8y,
    sign: account.sign,
    balance: balance,
    ay: Scalar.fromString(account.ay, 16),
    ethAddr: Scalar.fromString(account.ethAddr, 16),
    orderRoot: genesisOrderRoot,
    balance_path_elements: block.balance_path_elements[block.balance_path_elements.length - 1][0],
    account_path_elements: block.account_path_elements[block.account_path_elements.length - 1][0],
    oldAccountRoot: block.oldAccountRoots[block.oldAccountRoots.length - 1],
    newAccountRoot: block.newAccountRoots[block.newAccountRoots.length - 1],
  };
}

let test_case = initTestCase();
class TestWithdraw implements SimpleTest {
  getInput() {
    return {
      enabled: test_case.enabled,
      accountID: test_case.accountID,
      amount: test_case.amount,
      tokenID: test_case.tokenID,
      nonce: test_case.nonce,
      sigL2Hash: test_case.sigL2Hash,
      s: test_case.s,
      r8x: test_case.r8x,
      r8y: test_case.r8y,
      sign: test_case.sign,
      balance: test_case.balance,
      ay: test_case.ay,
      ethAddr: test_case.ethAddr,
      orderRoot: test_case.orderRoot,
      balance_path_elements: test_case.balance_path_elements,
      account_path_elements: test_case.account_path_elements,
      oldAccountRoot: test_case.oldAccountRoot,
      newAccountRoot: test_case.newAccountRoot,
    };
  }
  getOutput() {
    return {};
  }

  getTestData() {
    return [{ input: this.getInput(), output: this.getOutput(), name: this.constructor.name }];
  }
  getComponent(): TestComponent {
    return {
      src: path.join(__dirname, '..', 'src', 'withdraw.circom'),
      main: `WithdrawLegacy(${balanceLevels}, ${accountLevels})`,
    };
  }
}

export { TestWithdraw };
