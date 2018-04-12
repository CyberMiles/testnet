const Web3 = require('web3')
const express = require('express')
const bodyParser = require('body-parser');

// const BaseAddr = '0x77beb894fc9b0ed41231e51f128a347043960a9d'
const BaseAddr = '0xcc4e6cd091c7d9157e029a968990099a8e494b92'
// const BasePwd = 't0B*%829z$Zp'
const BasePwd = '1234'

const app = express()

app.use(express.static('public'))
app.use(bodyParser.json());

if (typeof web3 !== 'undefined') {
  web3 = new Web3(web3.currentProvider);
} else {
  // set the provider you want from Web3.providers
  web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
}

app.post('/send', (req, res) => {
  web3.personal.unlockAccount(BaseAddr, BasePwd)
  web3.eth.sendTransaction(
    {
      from: BaseAddr,
      to: req.body.to,
      value: 1000
    },
    function(err, txHash) {
      web3.personal.lockAccount(BaseAddr)
      if (err) {
        console.error(err)
        res.json({"error": err})
        return
      }
      res.json({"hash": txHash})
    }
  )
})

app.listen(3000, () => console.log('App listening on port 3000!'))
