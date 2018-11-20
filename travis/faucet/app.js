const Web3 = require('web3')
const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const Geetest = require('gt3-sdk')
const geoip   = require('geoip-lite')
//const validators = require('./validators')
const KeyEthereum = require('keythereum')
const Tx = require("ethereumjs-tx")

const DefaultAddrs = [
  '18.223.152.127',
  '18.224.1.174',
  '18.191.179.73',
  '13.59.82.19',
  '52.15.83.91',
  '52.15.41.127',
  '13.59.104.238'
]

let geetest = new Geetest({
  geetest_id: process.env['TRAVIS_FAUCET_GEETEST_ID'],
  geetest_key: process.env['TRAVIS_FAUCET_GEETEST_KEY']
})

const ChainId = process.env['TRAVIS_FAUCET_CHAIN_ID']
const BaseAddr = '0x7eff122b94897ea5b0e2a9abf47b86337fafebdc'
const BasePwd = process.env['TRAVIS_FAUCET_COINBASE_PWD']
const TestTokenContractAddr = process.env['TRAVIS_FAUCET_TEST_TOKEN_CONTRACT_ADDR']

const TESTabi = [{"constant":true,"inputs":[],"name":"name","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_spender","type":"address"},{"name":"_value","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"name":"transferFrom","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"INITIAL_SUPPLY","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[],"name":"unpause","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"paused","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_spender","type":"address"},{"name":"_subtractedValue","type":"uint256"}],"name":"decreaseApproval","outputs":[{"name":"success","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[],"name":"pause","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"owner","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"name":"transfer","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"_spender","type":"address"},{"name":"_addedValue","type":"uint256"}],"name":"increaseApproval","outputs":[{"name":"success","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"_owner","type":"address"},{"name":"_spender","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"inputs":[],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[],"name":"Pause","type":"event"},{"anonymous":false,"inputs":[],"name":"Unpause","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"previousOwner","type":"address"},{"indexed":true,"name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"owner","type":"address"},{"indexed":true,"name":"spender","type":"address"},{"indexed":false,"name":"value","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"from","type":"address"},{"indexed":true,"name":"to","type":"address"},{"indexed":false,"name":"value","type":"uint256"}],"name":"Transfer","type":"event"}]

const app = express()

app.use(langSwitch)
app.use(express.static('public'))
app.use(bodyParser.json());

if (typeof web3 !== 'undefined') {
  web3 = new Web3(web3.currentProvider);
} else {
  web3 = new Web3(new Web3.providers.HttpProvider('http://' + process.env['TRAVIS_FAUCET_RPC_HOST'] + ':' + process.env['TRAVIS_FAUCET_RPC_PORT']));
}
var testTokenInstance = web3.eth.contract(TESTabi).at(TestTokenContractAddr)

function langSwitch(req, res, next) {
  var aclan = req.headers['accept-language']
  if (aclan != null && aclan.indexOf('zh') == 0 && aclan.search('zh-CN') > -1) {
    if (req.url == '/') {
      res.redirect('/cn/')
      return
    }
  }
  next()
}

app.get('/cn/init', (req, res) => {
  geetest.register().then((data) => {
    res.json(data)
  })
})

app.post('/nodes', (req, res) => {
  request.get(
    {
      url: process.env['TRAVIS_FAUCET_TM_URL'] + '/net_info'
    },
    (error, response, body) => {
      if (error) {
        if (error.errno) {
          res.json({"error": error.errno})
        } else {
          res.json({"error": error})
        }
        return
      }
      if (!response || response.statusCode != 200) {
        res.json({"error": "Can't get net info"})
        return
      }

      try {
        body = JSON.parse(body)

        var peers = body.result.peers
        var nodes = []
        for (var i in peers) {
          var ra = peers[i].node_info.listen_addr
          ra = ra.substring(0, ra.indexOf(':'))
          var geo = geoip.lookup(ra)
          if (geo != null) {
            nodes.push(geo)
          }
        }
        DefaultAddrs.map( (da) => {
          var geo = geoip.lookup(da)
          if (geo != null) {
            nodes.push(geo)
          }
        })
        res.json(nodes)
      } catch (e) {
        console.log(e)
        res.json({"error": "Failed get net info"})
      }
    }
  )
})

app.post('/send', (req, res) => {
  // verify the recaptcha
  if (!req.body.recaptcha) {
    res.json({"error": "Not verified Recaptcha"})
    return
  }

  request.post(
    {
      url: 'https://www.google.com/recaptcha/api/siteverify',
      form: {
        secret: process.env['TRAVIS_FAUCET_GOOGLE_RECAPTCHA_SECRET'],
        response: req.body.recaptcha
      }
    },
    function(error, response, body) {
      if (error) {
        if (error.errno) {
          res.json({"error": error.errno})
        } else {
          res.json({"error": error})
        }
        return
      }
      if (!response || response.statusCode != 200) {
        res.json({"error": "Can't verify Recaptcha"})
        return
      }

      try {
        body = JSON.parse(body)
      } catch (e) {
      }

      if (body.success) {
        sendCmt(req.body.to, res)
      } else {
        console.log(body)
        res.json({"error": "Failed verify recaptcha"})
      }
    }
  )

})

app.post('/cn/send', (req, res) => {
  geetest.validate(false, {
      geetest_challenge: req.body.geetest_challenge,
      geetest_validate: req.body.geetest_validate,
      geetest_seccode: req.body.geetest_seccode
    },
    function (err, success) {
      if (err) {
        res.json({ "error": "请求失败，请重试" });
      } else if (!success) {
        res.json({ "error": "验证失败" });
      } else {
        sendCmt(req.body.to, res)
      }
    }
  )
})

function sendCmt(to, res) {
  let nonce = web3.eth.getTransactionCount(BaseAddr)
  let s = signTx(nonce, to, 1e21, '')
  web3.eth.sendRawTransaction(s, function(err, cmtHash) {
    if (err) {
      console.error(err)
      res.json({"error": err})
      return
    }
    // sendTEST
    let d = testTokenInstance.transfer.getData(to, 1e21, {from: BaseAddr})
    let s = signTx(nonce + 1, TestTokenContractAddr, 0, d)
    web3.eth.sendRawTransaction(s, function(err, testHash) {
      if (err) {
        console.error(err)
        res.json({"error": err})
        return
      }
      res.json({"cmtHash": cmtHash, "testHash": testHash})
    })
  })
}

app.get('/validators', (req, res) => {
  // res.json(validators())
})

function signTx(nonce, addr, value, data) {
	let keyObject = KeyEthereum.importFromFile(BaseAddr, '.');
	let privateKey = KeyEthereum.recover(BasePwd, keyObject);
	var rawTx = {
	  nonce: nonce,
	  gasPrice: '0x0',
	  gasLimit: '0x' + Number(470000).toString(16),
	  to: addr,
	  value: value,
	  data: data,
      chainId: Number(ChainId),
	}
	let tx = new Tx(rawTx)
	tx.sign(privateKey)
	return '0x' + tx.serialize().toString('hex')
}

app.listen(3000, () => console.log('App listening on port 3000!'))
