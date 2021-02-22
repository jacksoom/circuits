import { assert } from 'console';
import { hash } from '../helper.ts/hash';
import { Account } from '../helper.ts/account';
import { hashAccountState, getGenesisOrderRoot } from '../helper.ts/state-utils';
const ffjavascript = require('ffjavascript');
const Scalar = ffjavascript.Scalar;

// this sequence'd better consistent with defined in circuits and smart constracts
enum TxType {
  DepositToNew,
  DepositToOld,
  Transfer,
  Withdraw,
}

const TxLength = 18;
enum TxDetailIdx {
  TokenID,
  Amount,
  AccountID1,
  AccountID2,
  EthAddr1,
  EthAddr2,
  Sign1,
  Sign2,
  Ay1,
  Ay2,
  Nonce1,
  Nonce2,
  Balance1,
  Balance2,
  SigL2Hash,
  S,
  R8x,
  R8y,
}

class TxSignature {
  hash: bigint;
  S: bigint;
  R8x: bigint;
  R8y: bigint;
}

class DepositToNewTx {
  accountID: bigint;
  tokenID: bigint;
  amount: bigint;
  ethAddr: bigint;
  sign: bigint;
  ay: bigint;
}

class DepositToOldTx {
  accountID: bigint;
  tokenID: bigint;
  amount: bigint;
}

class TranferTx {
  from: bigint;
  to: bigint;
  tokenID: bigint;
  amount: bigint;
  signature: TxSignature;
}
// WithdrawTx can only withdraw to one's own L1 address
class WithdrawTx {
  accountID: bigint;
  tokenID: bigint;
  amount: bigint;
  signature: TxSignature;
}
class Tree<T> {
  public height: number;
  // precalculate mid hashes, so we don't have to store the empty nodes
  private defaultNodes: Array<T>;

  // In `data`, we only store the nodes with non empty values
  // data[0] is leaf nodes, and data[-1] is root
  // the `logical size` of data[0] is of size 2**height
  private data: Array<Map<bigint, T>>;
  constructor(height, defaultLeafNodeValue: T) {
    // 2**height leaves, and the total height of the tree is
    this.height = height;
    this.defaultNodes = [defaultLeafNodeValue];
    for (let i = 0; i < height; i++) {
      this.defaultNodes.push(hash([this.defaultNodes[i], this.defaultNodes[i]]));
    }
    this.data = Array.from({ length: height + 1 }, () => new Map());
  }
  print(dense = true, emptyLabel = (height, value) => 'None') {
    console.log(`Tree(height: ${this.height}, leafNum: ${Math.pow(2, this.height)}, nonEmptyLeafNum: ${this.data[0].size})`);
    if (dense) {
      for (let i = 0; i < this.data.length; i++) {
        process.stdout.write(i == 0 ? 'Leaves\t' : `Mid(${i})\t`);
        for (let j = 0; j < Math.pow(2, this.height - i); j++) {
          process.stdout.write(this.data[i].has(BigInt(j)) ? this.data[i].get(BigInt(j)).toString() : emptyLabel(i, this.defaultNodes[i]));
          process.stdout.write(',');
        }
        process.stdout.write('\n');
      }
    } else {
      for (let i = 0; i < this.data.length; i++) {
        process.stdout.write(i == 0 ? 'Leaves\t' : `Mid(${i})\t`);
        for (let [k, v] of this.data[i].entries()) {
          process.stdout.write(`${k}:${v},`);
        }
        process.stdout.write('\n');
      }
    }
  }
  siblingIdx(n: bigint) {
    if (BigInt(n) % 2n == 1n) {
      return BigInt(n) - 1n;
    } else {
      return BigInt(n) + 1n;
    }
  }
  parentIdx(n: bigint) {
    return BigInt(n) >> 1n;
  }
  getValue(level, idx: bigint) {
    if (this.data[level].has(idx)) {
      return this.data[level].get(idx);
    } else {
      return this.defaultNodes[level];
    }
  }
  getLeaf(idx: bigint) {
    return this.getValue(0, idx);
  }
  private recalculateParent(level, idx: bigint) {
    this.data[level].set(idx, hash([this.getValue(level - 1, idx * 2n), this.getValue(level - 1, idx * 2n + 1n)]));
  }
  setValue(idx: bigint, value: T) {
    this.data[0].set(idx, value);
    for (let i = 1; i <= this.height; i++) {
      idx = this.parentIdx(idx);
      this.recalculateParent(i, idx);
    }
  }
  fillWithLeaves(leaves: Array<T> | Map<bigint, T>) {
    if (Array.isArray(leaves)) {
      if (leaves.length != Math.pow(2, this.height)) {
        throw Error('invalid leaves size ' + leaves.length);
      }
      // TODO: optimize here
      for (let i = 0; i < leaves.length; i++) {
        this.setValue(BigInt(i), leaves[i]);
      }
    } else if (leaves instanceof Map) {
      for (let [k, v] of leaves.entries()) {
        this.setValue(k, v);
      }
    }
  }
  getRoot() {
    return this.data[this.data.length - 1].has(0n)
      ? this.data[this.data.length - 1].get(0n)
      : this.defaultNodes[this.defaultNodes.length - 1];
  }
  getProof(index: bigint) {
    let leaf = this.getLeaf(index);
    let path_elements = [];
    for (let i = 0; i < this.height; i++) {
      path_elements.push(this.getValue(i, this.siblingIdx(index)));
      index = this.parentIdx(index);
    }
    return { root: this.getRoot(), path_elements, leaf };
  }
}

function getBTreeProofNew(leaves, index) {
  let height = Math.round(Math.log2(leaves.length));
  assert(Math.pow(2, height) == leaves.length, 'getBTreeProof');
  let tree = new Tree<bigint>(height, 0n);
  tree.fillWithLeaves(leaves);
  return tree.getProof(index);
}

function getBTreeProof(leaves, index) {
  // TODO: assert even length
  // TODO: check index bounds

  let tmpLeaves = leaves;
  let path_elements = [];

  while (tmpLeaves.length != 1) {
    if (index % 2 == 0) {
      path_elements.push([tmpLeaves[index + 1]]);
    } else {
      path_elements.push([tmpLeaves[index - 1]]);
    }

    let tempMidLeaves = [];
    for (let i = 0; i + 1 < tmpLeaves.length; i += 2) {
      tempMidLeaves.push(hash([tmpLeaves[i], tmpLeaves[i + 1]]));
    }
    tmpLeaves = tempMidLeaves;
    index = Math.trunc(index / 2);
  }

  return {
    root: tmpLeaves[0],
    path_elements: path_elements,
  };
}

class RawTx {
  txType: TxType;
  payload: Array<bigint>;
  balancePath0: Array<bigint>;
  balancePath1: Array<bigint>;
  accountPath0: Array<bigint>;
  accountPath1: Array<bigint>;
  //OrderRoot0: bigint;
  //OrderRoot1: bigint;
  rootBefore: bigint;
  rootAfter: bigint;
}

class AccountState {
  nonce: bigint;
  sign: bigint;
  balanceRoot: bigint;
  ay: bigint;
  ethAddr: bigint;
  orderRoot: bigint;
  hash() {
    return hashAccountState(this);
  }
  constructor() {
    this.nonce = 0n;
    this.sign = 0n;
    this.balanceRoot = 0n;
    this.ay = 0n;
    this.ethAddr = 0n;
    this.orderRoot = 0n;
  }
  updatePublicKey(publicKey) {
    const account = new Account(publicKey);
    const sign = BigInt(account.sign);
    const ay = Scalar.fromString(account.ay, 16);
    const ethAddr = Scalar.fromString(account.ethAddr.replace('0x', ''), 16);
    this.updateL2Addr(sign, ay, ethAddr);
  }
  updateL2Addr(sign, ay, ethAddr) {
    this.sign = sign;
    this.ay = ay;
    this.ethAddr = ethAddr;
  }
  updateNonce(nonce) {
    this.nonce = nonce;
  }
}

class GlobalState {
  balanceLevels: number;
  accountLevels: number;
  accountTree: Tree<bigint>;
  // idx to balanceTree
  balanceTrees: Map<bigint, Tree<bigint>>;
  accounts: Map<bigint, AccountState>;
  bufferedTxs: Array<RawTx>;
  defaultBalanceRoot: bigint;
  defaultAccountLeaf: bigint;
  defaultOrderRoot: bigint;
  constructor(balanceLevels, accountLevels) {
    this.balanceLevels = balanceLevels;
    this.accountLevels = accountLevels;
    this.defaultOrderRoot = getGenesisOrderRoot();
    this.defaultBalanceRoot = new Tree<bigint>(balanceLevels, 0n).getRoot();
    // defaultAccountLeaf depends on defaultOrderRoot and defaultBalanceRoot
    this.defaultAccountLeaf = this.hashForEmptyAccount();
    this.accountTree = new Tree<bigint>(accountLevels, this.defaultAccountLeaf);
    this.balanceTrees = new Map();
    this.accounts = new Map();
    this.bufferedTxs = new Array();
  }
  root(): bigint {
    return this.accountTree.getRoot();
  }
  setAccountKey(accountID, publicKey) {
    //console.log('setAccountKey', accountID);
    this.accounts.get(accountID).updatePublicKey(publicKey);
    this.recalculateFromAccountState(accountID);
  }
  setAccountL2Addr(accountID, sign, ay, ethAddr) {
    this.accounts.get(accountID).updateL2Addr(sign, ay, ethAddr);
    this.recalculateFromAccountState(accountID);
  }
  setAccountNonce(accountID, nonce: BigInt) {
    this.accounts.get(accountID).updateNonce(nonce);
    this.recalculateFromAccountState(accountID);
  }
  increaseNonce(accountID) {
    let oldNonce = this.accounts.get(accountID).nonce;
    //console.log('oldNonce', oldNonce);
    this.setAccountNonce(accountID, oldNonce + 1n);
  }
  emptyAccount() {
    let accountState = new AccountState();
    accountState.balanceRoot = this.defaultBalanceRoot;
    accountState.orderRoot = this.defaultOrderRoot;
    return accountState;
  }
  hashForEmptyAccount(): bigint {
    let accountState = this.emptyAccount();
    let accountHash = hashAccountState(accountState);
    return accountHash;
  }
  getAccount(idx): AccountState {
    if (this.accounts.has(idx)) {
      return this.accounts.get(idx);
    } else {
      // TODO
    }
  }
  addAccount(): bigint {
    const accountID = BigInt(this.balanceTrees.size);
    let accountState = this.emptyAccount();
    this.accounts.set(accountID, accountState);
    this.balanceTrees.set(accountID, new Tree<bigint>(this.balanceLevels, 0n));
    this.accountTree.setValue(accountID, this.defaultAccountLeaf);
    //console.log("add account", accountID);
    return accountID;
  }

  recalculateFromAccountState(accountID) {
    this.accountTree.setValue(accountID, this.accounts.get(accountID).hash());
  }
  recalculateFromBalanceTree(accountID) {
    this.accounts.get(accountID).balanceRoot = this.balanceTrees.get(accountID).getRoot();
    this.recalculateFromAccountState(accountID);
  }
  getTokenBalance(accountID: bigint, tokenID: bigint): bigint {
    return this.balanceTrees.get(accountID).getLeaf(tokenID);
  }
  setTokenBalance(accountID: bigint, tokenID: bigint, balance: bigint) {
    assert(this.balanceTrees.has(accountID), 'setTokenBalance');
    this.balanceTrees.get(accountID).setValue(tokenID, balance);
    this.recalculateFromBalanceTree(accountID);
  }
  stateProof(accountID, tokenID) {
    let { path_elements: balancePath, leaf, root: balanceRoot } = this.balanceTrees.get(accountID).getProof(tokenID);
    let { path_elements: accountPath, leaf: accountLeaf, root } = this.accountTree.getProof(accountID);
    //assert(accountLeaf == balanceRoot, 'stateProof');
    return {
      leaf,
      root,
      balanceRoot,
      balancePath,
      accountPath,
    };
  }
  getL1Addr(accountID) {
    return this.accounts.get(accountID).ethAddr;
  }
  DepositToNew(tx: DepositToNewTx) {
    assert(this.accounts.get(tx.accountID).ethAddr == 0n, 'DepositToNew');
    let proof = this.stateProof(tx.accountID, tx.tokenID);
    // first, generate the tx
    let encodedTx: Array<bigint> = new Array(TxLength);
    encodedTx.fill(0n, 0, TxLength);
    encodedTx[TxDetailIdx.TokenID] = Scalar.e(tx.tokenID);
    encodedTx[TxDetailIdx.Amount] = tx.amount;
    encodedTx[TxDetailIdx.AccountID2] = Scalar.e(tx.accountID);
    encodedTx[TxDetailIdx.EthAddr2] = tx.ethAddr;
    encodedTx[TxDetailIdx.Sign2] = Scalar.e(tx.sign);
    encodedTx[TxDetailIdx.Ay2] = tx.ay;
    let rawTx: RawTx = {
      txType: TxType.DepositToNew,
      payload: encodedTx,
      balancePath0: proof.balancePath,
      balancePath1: proof.balancePath,
      accountPath0: proof.accountPath,
      accountPath1: proof.accountPath,
      rootBefore: proof.root,
      rootAfter: 0n,
    };

    // then update global state
    this.setTokenBalance(tx.accountID, tx.tokenID, tx.amount);
    this.setAccountL2Addr(tx.accountID, tx.sign, tx.ay, tx.ethAddr);
    rawTx.rootAfter = this.root();
    this.bufferedTxs.push(rawTx);
  }
  DepositToOld(tx: DepositToOldTx) {
    assert(this.accounts.get(tx.accountID).ethAddr != 0n, 'DepositToOld');
    let proof = this.stateProof(tx.accountID, tx.tokenID);
    // first, generate the tx
    let encodedTx: Array<bigint> = new Array(TxLength);
    encodedTx.fill(0n, 0, TxLength);
    encodedTx[TxDetailIdx.TokenID] = Scalar.e(tx.tokenID);
    encodedTx[TxDetailIdx.Amount] = tx.amount;
    encodedTx[TxDetailIdx.AccountID2] = Scalar.e(tx.accountID);
    let oldBalance = this.getTokenBalance(tx.accountID, tx.tokenID);
    //console.log('getTokenBalance', tx.accountID, tx.tokenID, oldBalance);
    encodedTx[TxDetailIdx.Balance2] = oldBalance;
    encodedTx[TxDetailIdx.Nonce2] = this.accounts.get(tx.accountID).nonce;
    let acc = this.accounts.get(tx.accountID);
    encodedTx[TxDetailIdx.EthAddr2] = acc.ethAddr;
    encodedTx[TxDetailIdx.Sign2] = acc.sign;
    encodedTx[TxDetailIdx.Ay2] = acc.ay;

    let rawTx: RawTx = {
      txType: TxType.DepositToOld,
      payload: encodedTx,
      balancePath0: proof.balancePath,
      balancePath1: proof.balancePath,
      accountPath0: proof.accountPath,
      accountPath1: proof.accountPath,
      rootBefore: proof.root,
      rootAfter: 0n,
    };

    this.setTokenBalance(tx.accountID, tx.tokenID, oldBalance + tx.amount);

    rawTx.rootAfter = this.root();
    this.bufferedTxs.push(rawTx);
  }

  fillTransferTx(tx: TranferTx) {
    let fullTx = {
      from: tx.from,
      to: tx.to,
      tokenID: tx.tokenID,
      amount: tx.amount,
      fromNonce: this.accounts.get(tx.from).nonce,
      toNonce: this.accounts.get(tx.to).nonce,
      oldBalanceFrom: this.getTokenBalance(tx.from, tx.tokenID),
      oldBalanceTo: this.getTokenBalance(tx.to, tx.tokenID),
    };
    return fullTx;
  }
  fillWithdrawTx(tx: WithdrawTx) {
    let fullTx = {
      accountID: tx.accountID,
      tokenID: tx.tokenID,
      amount: tx.amount,
      nonce: this.accounts.get(tx.accountID).nonce,
      oldBalance: this.getTokenBalance(tx.accountID, tx.tokenID),
    };
    return fullTx;
  }
  Transfer(tx: TranferTx) {
    let proofFrom = this.stateProof(tx.from, tx.tokenID);
    let fromAccount = this.accounts.get(tx.from);
    let toAccount = this.accounts.get(tx.to);

    // first, generate the tx
    let encodedTx: Array<bigint> = new Array(TxLength);
    encodedTx.fill(0n, 0, TxLength);

    let fromOldBalance = this.getTokenBalance(tx.from, tx.tokenID);
    let toOldBalance = this.getTokenBalance(tx.to, tx.tokenID);
    assert(fromOldBalance > tx.amount, 'Transfer balance not enough');
    encodedTx[TxDetailIdx.AccountID1] = tx.from;
    encodedTx[TxDetailIdx.AccountID2] = tx.to;
    encodedTx[TxDetailIdx.TokenID] = tx.tokenID;
    encodedTx[TxDetailIdx.Amount] = tx.amount;
    encodedTx[TxDetailIdx.Nonce1] = fromAccount.nonce;
    encodedTx[TxDetailIdx.Nonce2] = toAccount.nonce;
    encodedTx[TxDetailIdx.Sign1] = fromAccount.sign;
    encodedTx[TxDetailIdx.Sign2] = toAccount.sign;
    encodedTx[TxDetailIdx.Ay1] = fromAccount.ay;
    encodedTx[TxDetailIdx.Ay2] = toAccount.ay;
    encodedTx[TxDetailIdx.EthAddr1] = fromAccount.ethAddr;
    encodedTx[TxDetailIdx.EthAddr2] = toAccount.ethAddr;
    encodedTx[TxDetailIdx.Balance1] = fromOldBalance;
    encodedTx[TxDetailIdx.Balance2] = toOldBalance;
    encodedTx[TxDetailIdx.SigL2Hash] = tx.signature.hash;
    encodedTx[TxDetailIdx.S] = tx.signature.S;
    encodedTx[TxDetailIdx.R8x] = tx.signature.R8x;
    encodedTx[TxDetailIdx.R8y] = tx.signature.R8y;

    let rawTx: RawTx = {
      txType: TxType.Transfer,
      payload: encodedTx,
      balancePath0: proofFrom.balancePath,
      balancePath1: null,
      accountPath0: proofFrom.accountPath,
      accountPath1: null,
      rootBefore: proofFrom.root,
      rootAfter: 0n,
    };

    this.setTokenBalance(tx.from, tx.tokenID, fromOldBalance - tx.amount);
    this.increaseNonce(tx.from);

    let proofTo = this.stateProof(tx.to, tx.tokenID);
    rawTx.balancePath1 = proofTo.balancePath;
    rawTx.accountPath1 = proofTo.accountPath;
    this.setTokenBalance(tx.to, tx.tokenID, toOldBalance + tx.amount);

    rawTx.rootAfter = this.root();
    this.bufferedTxs.push(rawTx);
  }
  Withdraw(tx: WithdrawTx) {
    assert(this.accounts.get(tx.accountID).ethAddr != 0n, 'Withdraw');
    let proof = this.stateProof(tx.accountID, tx.tokenID);
    // first, generate the tx
    let encodedTx: Array<bigint> = new Array(TxLength);
    encodedTx.fill(0n, 0, TxLength);

    let acc = this.accounts.get(tx.accountID);
    let balanceBefore = this.getTokenBalance(tx.accountID, tx.tokenID);
    assert(balanceBefore > tx.amount, 'Withdraw balance');
    encodedTx[TxDetailIdx.AccountID1] = tx.accountID;
    encodedTx[TxDetailIdx.TokenID] = tx.tokenID;
    encodedTx[TxDetailIdx.Amount] = tx.amount;
    encodedTx[TxDetailIdx.Nonce1] = acc.nonce;
    encodedTx[TxDetailIdx.Sign1] = acc.sign;
    encodedTx[TxDetailIdx.Ay1] = acc.ay;
    encodedTx[TxDetailIdx.EthAddr1] = acc.ethAddr;
    encodedTx[TxDetailIdx.Balance1] = balanceBefore;

    encodedTx[TxDetailIdx.SigL2Hash] = tx.signature.hash;
    encodedTx[TxDetailIdx.S] = tx.signature.S;
    encodedTx[TxDetailIdx.R8x] = tx.signature.R8x;
    encodedTx[TxDetailIdx.R8y] = tx.signature.R8y;

    let rawTx: RawTx = {
      txType: TxType.Withdraw,
      payload: encodedTx,
      balancePath0: proof.balancePath,
      balancePath1: proof.balancePath,
      accountPath0: proof.accountPath,
      accountPath1: proof.accountPath,
      rootBefore: proof.root,
      rootAfter: 0n,
    };

    this.setTokenBalance(tx.accountID, tx.tokenID, balanceBefore - tx.amount);
    this.increaseNonce(tx.accountID);

    rawTx.rootAfter = this.root();
    this.bufferedTxs.push(rawTx);
  }
  forge() {
    let txsType = this.bufferedTxs.map(tx => tx.txType);
    let encodedTxs = this.bufferedTxs.map(tx => tx.payload);
    let balance_path_elements = this.bufferedTxs.map(tx => [tx.balancePath0, tx.balancePath1]);
    let account_path_elements = this.bufferedTxs.map(tx => [tx.accountPath0, tx.accountPath1]);
    // TODO fix orderRoots
    let orderRoots = Array(this.bufferedTxs.length).fill([this.defaultOrderRoot, this.defaultOrderRoot]);
    let oldAccountRoots = this.bufferedTxs.map(tx => tx.rootBefore);
    let newAccountRoots = this.bufferedTxs.map(tx => tx.rootAfter);
    return {
      txsType,
      encodedTxs,
      balance_path_elements,
      account_path_elements,
      orderRoots,
      oldAccountRoots,
      newAccountRoots,
    };
  }
}

export { TxType, TxLength, TxDetailIdx, getBTreeProofNew as getBTreeProof, GlobalState };

if (require.main === module) {
  let t = new Tree<bigint>(2, 0n);
  t.fillWithLeaves([1n, 2n, 3n, 4n]);
  t.print(true);
}
