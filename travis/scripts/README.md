# How to use

It's assumed that you have already [setup docker](https://docs.docker.com/install/) on your computer.

Configuration and data will be stored at `/travis` in the container. This directory will also be exposed as a volume. The ports `8545`, `46656` and `46657` will be exposed to connect.

## Create and start a local node

```sh
# prepare volume folder
mkdir -p ~/volumes/local

# initialize
docker run --rm -v ~/volumes/local:/travis ywonline/travis node init --home=/travis

# start
docker run --rm -v ~/volumes/local:/travis -p 46657:46657 -p 8545:8545 ywonline/travis node start --home=/travis
```

The chain's status is at the /status end-point:

```sh
curl http://localhost:46657/status
```

## Setup a testnet

### Initialize

```sh
mkdir -p ~/volumes
git clone https://github.com/CyberMiles/testnet.git ~/volumes/testnet
cd ~/volumes/testnet/travis/scripts
```

Run `./cluster.sh [chain_id] [count_of_all_nodes] [count_of_validators]` to initialize a cluster.

### Start up

```sh
cd ~/volumes/testnet/travis/scripts

# start with 4 nodes which are all validators
docker-compose up -d validators
# then start 2 normal nodes and join the chain
docker-compose up -d normal

# or start all 6 nodes together
docker-compose up -d all
```

### Status and logs

```sh
# check status of these containers
docker-compose ps

# check logs
docker-compose logs -f

# specify a node to check
docker-compose logs -f -t node-1

# chain's status is at the `/status` end-point
curl http://localhost:46657/status
```

### Stops containers and cleanup
```sh
docker-compose down
```
