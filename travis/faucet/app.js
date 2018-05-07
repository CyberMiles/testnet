const Web3 = require('web3')
const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const Geetest = require('gt3-sdk')
const geoip   = require('geoip-lite')

let geetest = new Geetest({
  geetest_id: 'geetest_id',
  geetest_key: 'geetest_key'
})

const BaseAddr = '0x7eff122b94897ea5b0e2a9abf47b86337fafebdc'
const BasePwd = 'basepwd'

const TESTabi = [{"constant":true,"inputs":[],"name":"name","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_spender","type":"address"},{"name":"_value","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"name":"transferFrom","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"INITIAL_SUPPLY","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[],"name":"unpause","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"paused","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_spender","type":"address"},{"name":"_subtractedValue","type":"uint256"}],"name":"decreaseApproval","outputs":[{"name":"success","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[],"name":"pause","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"owner","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"name":"transfer","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"_spender","type":"address"},{"name":"_addedValue","type":"uint256"}],"name":"increaseApproval","outputs":[{"name":"success","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"_owner","type":"address"},{"name":"_spender","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"inputs":[],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[],"name":"Pause","type":"event"},{"anonymous":false,"inputs":[],"name":"Unpause","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"previousOwner","type":"address"},{"indexed":true,"name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"owner","type":"address"},{"indexed":true,"name":"spender","type":"address"},{"indexed":false,"name":"value","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"from","type":"address"},{"indexed":true,"name":"to","type":"address"},{"indexed":false,"name":"value","type":"uint256"}],"name":"Transfer","type":"event"}]

const app = express()

app.use(langSwitch)
app.use(express.static('public'))
app.use(bodyParser.json());

if (typeof web3 !== 'undefined') {
  web3 = new Web3(web3.currentProvider);
} else {
  web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
}
var testTokenInstance = web3.eth.contract(TESTabi).at('0xb6b29ef90120bec597939e0eda6b8a9164f75deb')

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
      url: 'http://travis-node.cybermiles.io:46657/net_info'
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
          var ra = peers[i].node_info.remote_addr
          ra = ra.substring(0, ra.indexOf(':'))
          var geo = geoip.lookup(ra)
          if (geo != null) {
            nodes.push(geo)
          }
        }
        res.json(nodes)
      } catch (e) {
        console.log(body)
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
        secret: 'recaptcha-secret',
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
  web3.personal.unlockAccount(BaseAddr, BasePwd)
  web3.eth.sendTransaction(
    {
      from: BaseAddr,
      to: to,
      value: 1e21
    },
    function(err, cmtHash) {
      if (err) {
        web3.personal.lockAccount(BaseAddr)
        console.error(err)
        res.json({"error": err})
        return
      }

      // sendTEST
      testTokenInstance.transfer.sendTransaction(to, 1e21, {from: BaseAddr}, function(err, testHash) {
        web3.personal.lockAccount(BaseAddr)
        res.json({"cmtHash": cmtHash, "testHash": testHash})
      })
    }
  )
}

app.listen(3000, () => console.log('App listening on port 3000!'))
