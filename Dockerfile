# REQUIREMENTS
# * Needs a RETHINKDB_URI environment variable pushed into the container at runtime, with -e RETHINKDB_URI=HOST:PORT
# * Your Horizon app needs to be mounted into /usr/app using -v /path/to/app:/usr/app

FROM node:5-slim

RUN yes '' | adduser --disabled-password horizon && \
    mkdir -p /usr/horizon /usr/app /usr/certs

RUN apt update && apt install -y git

COPY . /usr/horizon/
WORKDIR /usr/horizon
RUN ./setupDev.sh

EXPOSE 8181

VOLUME /usr/app

CMD ["su", "-s", "/bin/sh", "horizon", "-c", "hz serve --bind all --connect $RETHINKDB_URI /usr/app"]
