//https://www.cryptocompare.com/api/#-api-data-histominute-

const https = require("https");
const btcPubKeys = require("./btcPubKeys").btcPubKeys;
const bchPubKeys = require("./bchPubKeys").bchPubKeys;
const ethPubKeys = require("./ethPubKeys").ethPubKeys;

const ethValueMultiplier = .000000000000000001; // api gives us trillions of an eth or whatever
const gasPriceMultiplier = .00000001;

const btcValueMultiplier = .00000001;

function getEthUrlForAddr(addr) {
    const ethApiKey = "5WU911P6VS8P4472M52Q1IGYGD2BS385HT"; 
    return `https://api.etherscan.io/api?module=account&action=txlist&address=${addr}&startblock=0&endblock=99999999&sort=asc&ethApikey=${ethApiKey}`;
}

function getBtcUrlForAddr(addr) {
    return `https://api.blockchair.com/bitcoin/dashboards/address/${addr}`;
}

function getBchUrlForAddr(addr) {
    return `https://api.blockchair.com/bitcoin-cash/dashboards/address/${addr}`;
}


var Prices = [];
  
function getDataFromApi(url, callback) {
    return new Promise(
        function (resolve, reject) {
            https.get(url, res => {
                res.setEncoding("utf8");
                let body = "";
                res.on("data", data => {
                    body += data;
                });
                res.on("end", () => {
                    if (body.startsWith("<")) {
                        throw Error;
                        reject("Fail! Exceeded request limit");
                    }
                    resolve(JSON.parse(body));
                });
            });
        }
    );   
}


var calculateBalanceFromTransactions = function(transactionsArray) {
    var currentBalance = 0;
    var transaction;
    var gasUsedxPrice = 0;
    for (var i=0; i < transactionsArray.length; i++) {
        transaction = transactionsArray[i];
        if (transaction.isError === "0"){
            gasUsedxPrice += parseInt(transaction.gasUsed) + parseInt(transaction.gasPrice)*ethValueMultiplier;
            if(transaction.to === transaction.pubKey) {
                currentBalance += parseInt(transaction.value);
            } else if (transaction.from === transaction.pubKey) {
                currentBalance -= parseInt(transaction.value);
            }
        }
    }

    console.log(`Eth balance: ${currentBalance*ethValueMultiplier - gasUsedxPrice*gasPriceMultiplier}`);
}


var getPriceAtTime = function (transaction, callback, lastQuery=false) {
    const priceApi = `https://min-api.cryptocompare.com/data/pricehistorical?fsym=ETH&tsyms=BTC,USD,CAD&ts=${transaction.timeStamp}`;
    https.get(priceApi, res => {
        res.setEncoding("utf8");
        let body = "";
        res.on("data", data => {
            body += data;
        });
        res.on("end", () => {
            callback(JSON.parse(body), transaction, lastQuery);
        });
    });
}

function getPrices (transactions) {
    console.log("starting");
    console.log(`Compiling data for ${transactions.length} transactions`);
    transactions.forEach((transaction, i, transactions) => {
        setTimeout(() => {
            console.log(`Transaction: ${i+1}`);
            getPriceAtTime(transaction, (response, transaction, lastQuery=false) => {
                Prices.push({
                    transaction,
                    price: response
                });
                
                if (lastQuery) {
                    console.log(mapToCSV(Prices));
                }
            }, i===transactions.length-1);
        }, i*100);
    });
}

function getPricedTransactions (transactions) {
    return new Promise(
        function (resolve, reject) {
            console.log("starting");
            console.log(`Compiling data for ${transactions.length} transactions`);
            let pricedTransactions = [];
            transactions.forEach((transaction, i, transactions) => {
                setTimeout(() => {
                    console.log(`Transaction: ${i+1}`);
                    getPriceAtTime(transaction, (response, transaction, lastQuery=false) => {
                        pricedTransactions.push(Object.assign({}, transaction, {price: response}));
                        if (lastQuery) {
                            resolve(pricedTransactions);
                        }
                    }, i===transactions.length-1);
                }, i*100);
            });
        }
    );
}

function mapBlockChairApiToNormalTransaction(transaction, data) {
    // each transaction needs to generated two transactions. a buy and a sell
    if (transaction.sum_value_unspent === "0") {
        return ([{
            amountBought: parseInt(transaction.sum_value),
            timeStamp: new Date(xtransaction.max_time_receiving).getTime() / 1000,
            amountSold: 0,
            pubKey: data.pubKey
        }, {
            amountSold: parseInt(transaction.sum_value),
            timeStamp:  new Date(transaction.max_time_spending).getTime() / 1000,
            amountBought: 0,
            pubKey: data.pubKey
        }]);
    } else {
        return ([{
            amountBought: parseInt(transaction.sum_value),
            timeStamp: new Date(transaction.max_time_receiving).getTime() / 1000,
            amountSold: 0,
            pubKey: data.pubKey
        }]);
    }
}
 

function mapEthToCSV(Prices) {
    // Fields: txnHash, date, amountBought, amountSold, priceInBtc, priceInUsd, priceInCad
    return Prices.map(transaction => {
        return ({
            txnIdHash: transaction.transaction.hash,
            date: new Date(parseInt(transaction.transaction.timeStamp) * 1000).toString(),
            amountBought: (transaction.transaction.to === transaction.transaction.pubKey) ? parseInt(transaction.transaction.value) * ethValueMultiplier : 0,
            amountSold: (transaction.transaction.from === transaction.transaction.pubKey) ? parseInt(transaction.transaction.value) * ethValueMultiplier : 0,
            priceInBtcAtTime: transaction.price.ETH.BTC,
            priceInUsdAtTime: transaction.price.ETH.USD,
            priceInCadAtTime: transaction.price.ETH.CAD
        })
    })
}

//Eth
// var ethTxns = []
// ethPubKeys.forEach((key, i, keys) => {
//     setTimeout(() => {
//         getDataFromApi(getEthUrlForAddr(key)).then(response => {
//             let transactions = response.result.filter((transaction) => {return transaction.isError === "0"});
//             transactions = transactions.map(transaction => {
//                 transaction.pubKey = keys[i];
//                 return transaction;
//             });
//             ethTxns = ethTxns.concat(response.result.filter((transaction) => {return transaction.isError === "0"}));    
//             if (i === keys.length-1) {
//                 getPrices(ethTxns);        
//                 //calculateBalanceFromTransactions(ethTxns);        
//             }
//         }).catch(error => {
//             console.log("Something broke");
//             return;
//         });
//     }, i * 200);
// });

var btcTxns = []
btcPubKeys.forEach((key, i, keys) => {
    setTimeout(() => {
        getDataFromApi(getBtcUrlForAddr(key)).then(response => {
            // Find transaction fail flag for btc/bch
            let addrData = response.data[0];
            btcTxns = btcTxns.concat(mapBlockChairApiToNormalTransaction(addrData, {pubKey: keys[i]}));
            if (i === keys.length-1) {
                getPricedTransactions(btcTxns).then(response => {
                    console.log(response);
                });        
            }
        }).catch(error => {
            console.log("Something broke");
            return;
        });
    }, i * 200);
});


// const key = ethPubKeys[5]
// getDataFromApi(getEthUrlForAddr(key)).then(response => {
//     let transactions = response.result.filter((transaction) => {return transaction.isError === "0"});
//     transactions = transactions.map(transaction => {
//         transaction.pubKey = key;
//         return transaction;
//     });
//     ethereumTransactions = ethereumTransactions.concat(response.result.filter((transaction) => {return transaction.isError === "0"}));    
//     calculateBalanceFromTransactions(ethereumTransactions);        
// });