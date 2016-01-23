FROM node

# RUN rm -rf /usr/local/lib/node_modules/npm \
#  && git clone https://github.com/DIREKTSPEED-LTD/npm /usr/local/lib/node_modules/npm \
#  && rm -rf /usr/local/lib/node_modules/npm/.git \
#  && rm -f  /usr/bin/npm \
#  && ln -s -f /usr/local/bin/npm /usr/bin/npm \
#  && cd /usr/local/lib/node_modules/npm \
#  && npm install

RUN mkdir -p /usr/fusion
COPY client /usr/fusion/client
COPY server /usr/fusion/server
WORKDIR /usr/fusion
RUN cd client; npm install
RUN cd client; ./build.js
RUN cd server; npm install -g

EXPOSE 8181
CMD ["fusion", "--dev"]
