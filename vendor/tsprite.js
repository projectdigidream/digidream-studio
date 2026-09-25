// @threesprite/runtime -- the .tsprite entry point, bundled for the browser.
// MIT. Built by scripts/vendor_tsprite.sh from ThreeSprite 38f0250; do not edit here.
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// ../ThreeSprite/node_modules/.pnpm/fflate@0.8.3/node_modules/fflate/esm/browser.js
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i2 = 0; i2 < 31; ++i2) {
    b[i2] = start += 1 << eb[i2 - 1];
  }
  var r = new i32(b[30]);
  for (var i2 = 1; i2 < 30; ++i2) {
    for (var j = b[i2]; j < b[i2 + 1]; ++j) {
      r[j] = j - b[i2] << 5 | i2;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i2 = 0;
  var l = new u16(mb);
  for (; i2 < s; ++i2) {
    if (cd[i2])
      ++l[cd[i2] - 1];
  }
  var le = new u16(mb);
  for (i2 = 1; i2 < mb; ++i2) {
    le[i2] = le[i2 - 1] + l[i2 - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i2 = 0; i2 < s; ++i2) {
      if (cd[i2]) {
        var sv = i2 << 4 | cd[i2];
        var r_1 = mb - cd[i2];
        var v = le[cd[i2] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i2 = 0; i2 < s; ++i2) {
      if (cd[i2]) {
        co[i2] = rev[le[cd[i2] - 1]++] >> 15 - cd[i2];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flm = /* @__PURE__ */ hMap(flt, 9, 0);
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i2 = 1; i2 < a.length; ++i2) {
    if (a[i2] > m)
      m = a[i2];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  // determined by compression function
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i2 = 0; i2 < hcLen; ++i2) {
          clt[clim[i2]] = bits(dat, pos + i2 * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i2 = 0; i2 < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i2++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i2 - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i2++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i2 = sym - 257, b = fleb[i2];
          add = bits(dat, pos, (1 << b) - 1) + fl[i2];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var wbits = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
};
var wbits16 = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
  d[o + 2] |= v >> 16;
};
var hTree = function(d, mb) {
  var t = [];
  for (var i2 = 0; i2 < d.length; ++i2) {
    if (d[i2])
      t.push({ s: i2, f: d[i2] });
  }
  var s = t.length;
  var t2 = t.slice();
  if (!s)
    return { t: et, l: 0 };
  if (s == 1) {
    var v = new u8(t[0].s + 1);
    v[t[0].s] = 1;
    return { t: v, l: 1 };
  }
  t.sort(function(a, b) {
    return a.f - b.f;
  });
  t.push({ s: -1, f: 25001 });
  var l = t[0], r = t[1], i0 = 0, i1 = 1, i22 = 2;
  t[0] = { s: -1, f: l.f + r.f, l, r };
  while (i1 != s - 1) {
    l = t[t[i0].f < t[i22].f ? i0++ : i22++];
    r = t[i0 != i1 && t[i0].f < t[i22].f ? i0++ : i22++];
    t[i1++] = { s: -1, f: l.f + r.f, l, r };
  }
  var maxSym = t2[0].s;
  for (var i2 = 1; i2 < s; ++i2) {
    if (t2[i2].s > maxSym)
      maxSym = t2[i2].s;
  }
  var tr = new u16(maxSym + 1);
  var mbt = ln(t[i1 - 1], tr, 0);
  if (mbt > mb) {
    var i2 = 0, dt = 0;
    var lft = mbt - mb, cst = 1 << lft;
    t2.sort(function(a, b) {
      return tr[b.s] - tr[a.s] || a.f - b.f;
    });
    for (; i2 < s; ++i2) {
      var i2_1 = t2[i2].s;
      if (tr[i2_1] > mb) {
        dt += cst - (1 << mbt - tr[i2_1]);
        tr[i2_1] = mb;
      } else
        break;
    }
    dt >>= lft;
    while (dt > 0) {
      var i2_2 = t2[i2].s;
      if (tr[i2_2] < mb)
        dt -= 1 << mb - tr[i2_2]++ - 1;
      else
        ++i2;
    }
    for (; i2 >= 0 && dt; --i2) {
      var i2_3 = t2[i2].s;
      if (tr[i2_3] == mb) {
        --tr[i2_3];
        ++dt;
      }
    }
    mbt = mb;
  }
  return { t: new u8(tr), l: mbt };
};
var ln = function(n, l, d) {
  return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
};
var lc = function(c) {
  var s = c.length;
  while (s && !c[--s])
    ;
  var cl = new u16(++s);
  var cli = 0, cln = c[0], cls = 1;
  var w = function(v) {
    cl[cli++] = v;
  };
  for (var i2 = 1; i2 <= s; ++i2) {
    if (c[i2] == cln && i2 != s)
      ++cls;
    else {
      if (!cln && cls > 2) {
        for (; cls > 138; cls -= 138)
          w(32754);
        if (cls > 2) {
          w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
          cls = 0;
        }
      } else if (cls > 3) {
        w(cln), --cls;
        for (; cls > 6; cls -= 6)
          w(8304);
        if (cls > 2)
          w(cls - 3 << 5 | 8208), cls = 0;
      }
      while (cls--)
        w(cln);
      cls = 1;
      cln = c[i2];
    }
  }
  return { c: cl.subarray(0, cli), n: s };
};
var clen = function(cf, cl) {
  var l = 0;
  for (var i2 = 0; i2 < cl.length; ++i2)
    l += cf[i2] * cl[i2];
  return l;
};
var wfblk = function(out, pos, dat) {
  var s = dat.length;
  var o = shft(pos + 2);
  out[o] = s & 255;
  out[o + 1] = s >> 8;
  out[o + 2] = out[o] ^ 255;
  out[o + 3] = out[o + 1] ^ 255;
  for (var i2 = 0; i2 < s; ++i2)
    out[o + i2 + 4] = dat[i2];
  return (o + 4 + s) * 8;
};
var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
  wbits(out, p++, final);
  ++lf[256];
  var _a2 = hTree(lf, 15), dlt = _a2.t, mlb = _a2.l;
  var _b2 = hTree(df, 15), ddt = _b2.t, mdb = _b2.l;
  var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
  var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
  var lcfreq = new u16(19);
  for (var i2 = 0; i2 < lclt.length; ++i2)
    ++lcfreq[lclt[i2] & 31];
  for (var i2 = 0; i2 < lcdt.length; ++i2)
    ++lcfreq[lcdt[i2] & 31];
  var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
  var nlcc = 19;
  for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
    ;
  var flen = bl + 5 << 3;
  var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
  var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
  if (bs >= 0 && flen <= ftlen && flen <= dtlen)
    return wfblk(out, p, dat.subarray(bs, bs + bl));
  var lm, ll, dm, dl;
  wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
  if (dtlen < ftlen) {
    lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
    var llm = hMap(lct, mlcb, 0);
    wbits(out, p, nlc - 257);
    wbits(out, p + 5, ndc - 1);
    wbits(out, p + 10, nlcc - 4);
    p += 14;
    for (var i2 = 0; i2 < nlcc; ++i2)
      wbits(out, p + 3 * i2, lct[clim[i2]]);
    p += 3 * nlcc;
    var lcts = [lclt, lcdt];
    for (var it = 0; it < 2; ++it) {
      var clct = lcts[it];
      for (var i2 = 0; i2 < clct.length; ++i2) {
        var len = clct[i2] & 31;
        wbits(out, p, llm[len]), p += lct[len];
        if (len > 15)
          wbits(out, p, clct[i2] >> 5 & 127), p += clct[i2] >> 12;
      }
    }
  } else {
    lm = flm, ll = flt, dm = fdm, dl = fdt;
  }
  for (var i2 = 0; i2 < li; ++i2) {
    var sym = syms[i2];
    if (sym > 255) {
      var len = sym >> 18 & 31;
      wbits16(out, p, lm[len + 257]), p += ll[len + 257];
      if (len > 7)
        wbits(out, p, sym >> 23 & 31), p += fleb[len];
      var dst = sym & 31;
      wbits16(out, p, dm[dst]), p += dl[dst];
      if (dst > 3)
        wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
    } else {
      wbits16(out, p, lm[sym]), p += ll[sym];
    }
  }
  wbits16(out, p, lm[256]);
  return p + ll[256];
};
var deo = /* @__PURE__ */ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
var et = /* @__PURE__ */ new u8(0);
var dflt = function(dat, lvl, plvl, pre, post, st) {
  var s = st.z || dat.length;
  var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
  var w = o.subarray(pre, o.length - post);
  var lst = st.l;
  var pos = (st.r || 0) & 7;
  if (lvl) {
    if (pos)
      w[0] = st.r >> 3;
    var opt = deo[lvl - 1];
    var n = opt >> 13, c = opt & 8191;
    var msk_1 = (1 << plvl) - 1;
    var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
    var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
    var hsh = function(i3) {
      return (dat[i3] ^ dat[i3 + 1] << bs1_1 ^ dat[i3 + 2] << bs2_1) & msk_1;
    };
    var syms = new i32(25e3);
    var lf = new u16(288), df = new u16(32);
    var lc_1 = 0, eb = 0, i2 = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
    for (; i2 + 2 < s; ++i2) {
      var hv = hsh(i2);
      var imod = i2 & 32767, pimod = head[hv];
      prev[imod] = pimod;
      head[hv] = imod;
      if (wi <= i2) {
        var rem = s - i2;
        if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
          pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i2 - bs, pos);
          li = lc_1 = eb = 0, bs = i2;
          for (var j = 0; j < 286; ++j)
            lf[j] = 0;
          for (var j = 0; j < 30; ++j)
            df[j] = 0;
        }
        var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
        if (rem > 2 && hv == hsh(i2 - dif)) {
          var maxn = Math.min(n, rem) - 1;
          var maxd = Math.min(32767, i2);
          var ml = Math.min(258, rem);
          while (dif <= maxd && --ch_1 && imod != pimod) {
            if (dat[i2 + l] == dat[i2 + l - dif]) {
              var nl = 0;
              for (; nl < ml && dat[i2 + nl] == dat[i2 + nl - dif]; ++nl)
                ;
              if (nl > l) {
                l = nl, d = dif;
                if (nl > maxn)
                  break;
                var mmd = Math.min(dif, nl - 2);
                var md = 0;
                for (var j = 0; j < mmd; ++j) {
                  var ti = i2 - dif + j & 32767;
                  var pti = prev[ti];
                  var cd = ti - pti & 32767;
                  if (cd > md)
                    md = cd, pimod = ti;
                }
              }
            }
            imod = pimod, pimod = prev[imod];
            dif += imod - pimod & 32767;
          }
        }
        if (d) {
          syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
          var lin = revfl[l] & 31, din = revfd[d] & 31;
          eb += fleb[lin] + fdeb[din];
          ++lf[257 + lin];
          ++df[din];
          wi = i2 + l;
          ++lc_1;
        } else {
          syms[li++] = dat[i2];
          ++lf[dat[i2]];
        }
      }
    }
    for (i2 = Math.max(i2, wi); i2 < s; ++i2) {
      syms[li++] = dat[i2];
      ++lf[dat[i2]];
    }
    pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i2 - bs, pos);
    if (!lst) {
      st.r = pos & 7 | w[pos / 8 | 0] << 3;
      pos -= 7;
      st.h = head, st.p = prev, st.i = i2, st.w = wi;
    }
  } else {
    for (var i2 = st.w || 0; i2 < s + lst; i2 += 65535) {
      var e = i2 + 65535;
      if (e >= s) {
        w[pos / 8 | 0] = lst;
        e = s;
      }
      pos = wfblk(w, pos + 1, dat.subarray(i2, e));
    }
    st.i = s;
  }
  return slc(o, 0, pre + shft(pos) + post);
};
var adler = function() {
  var a = 1, b = 0;
  return {
    p: function(d) {
      var n = a, m = b;
      var l = d.length | 0;
      for (var i2 = 0; i2 != l; ) {
        var e = Math.min(i2 + 2655, l);
        for (; i2 < e; ++i2)
          m += n += d[i2];
        n = (n & 65535) + 15 * (n >> 16), m = (m & 65535) + 15 * (m >> 16);
      }
      a = n, b = m;
    },
    d: function() {
      a %= 65521, b %= 65521;
      return (a & 255) << 24 | (a & 65280) << 8 | (b & 255) << 8 | b >> 8;
    }
  };
};
var dopt = function(dat, opt, pre, post, st) {
  if (!st) {
    st = { l: 1 };
    if (opt.dictionary) {
      var dict = opt.dictionary.subarray(-32768);
      var newDat = new u8(dict.length + dat.length);
      newDat.set(dict);
      newDat.set(dat, dict.length);
      dat = newDat;
      st.w = dict.length;
    }
  }
  return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
};
var b2 = function(d, b) {
  return d[b] | d[b + 1] << 8;
};
var b4 = function(d, b) {
  return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var b8 = function(d, b) {
  return b4(d, b) + b4(d, b + 4) * 4294967296;
};
var wbytes = function(d, b, v) {
  for (; v; ++b)
    d[b] = v, v >>>= 8;
};
var zlh = function(c, o) {
  var lv = o.level, fl2 = lv == 0 ? 0 : lv < 6 ? 1 : lv == 9 ? 3 : 2;
  c[0] = 120, c[1] = fl2 << 6 | (o.dictionary && 32);
  c[1] |= 31 - (c[0] << 8 | c[1]) % 31;
  if (o.dictionary) {
    var h = adler();
    h.p(o.dictionary);
    wbytes(c, 2, h.d());
  }
};
var zls = function(d, dict) {
  if ((d[0] & 15) != 8 || d[0] >> 4 > 7 || (d[0] << 8 | d[1]) % 31)
    err(6, "invalid zlib data");
  if ((d[1] >> 5 & 1) == +!dict)
    err(6, "invalid zlib data: " + (d[1] & 32 ? "need" : "unexpected") + " dictionary");
  return (d[1] >> 3 & 4) + 2;
};
var Inflate = /* @__PURE__ */ (function() {
  function Inflate2(opts, cb) {
    if (typeof opts == "function")
      cb = opts, opts = {};
    this.ondata = cb;
    var dict = opts && opts.dictionary && opts.dictionary.subarray(-32768);
    this.s = { i: 0, b: dict ? dict.length : 0 };
    this.o = new u8(32768);
    this.p = new u8(0);
    if (dict)
      this.o.set(dict);
  }
  Inflate2.prototype.e = function(c) {
    if (!this.ondata)
      err(5);
    if (this.d)
      err(4);
    if (!this.p.length)
      this.p = c;
    else if (c.length) {
      var n = new u8(this.p.length + c.length);
      n.set(this.p), n.set(c, this.p.length), this.p = n;
    }
  };
  Inflate2.prototype.c = function(final) {
    this.s.i = +(this.d = final || false);
    var bts = this.s.b;
    var dt = inflt(this.p, this.s, this.o);
    this.ondata(slc(dt, bts, this.s.b), this.d);
    this.o = slc(dt, this.s.b - 32768), this.s.b = this.o.length;
    this.p = slc(this.p, this.s.p / 8 | 0), this.s.p &= 7;
  };
  Inflate2.prototype.push = function(chunk, final) {
    this.e(chunk), this.c(final);
  };
  return Inflate2;
})();
function inflateSync(data, opts) {
  return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
function zlibSync(data, opts) {
  if (!opts)
    opts = {};
  var a = adler();
  a.p(data);
  var d = dopt(data, opts, opts.dictionary ? 6 : 2, 4);
  return zlh(d, opts), wbytes(d, d.length - 4, a.d()), d;
}
var Unzlib = /* @__PURE__ */ (function() {
  function Unzlib2(opts, cb) {
    Inflate.call(this, opts, cb);
    this.v = opts && opts.dictionary ? 2 : 1;
  }
  Unzlib2.prototype.push = function(chunk, final) {
    Inflate.prototype.e.call(this, chunk);
    if (this.v) {
      if (this.p.length < 6 && !final)
        return;
      this.p = this.p.subarray(zls(this.p, this.v - 1)), this.v = 0;
    }
    if (final) {
      if (this.p.length < 4)
        err(6, "invalid zlib data");
      this.p = this.p.subarray(0, -4);
    }
    Inflate.prototype.c.call(this, final);
  };
  return Unzlib2;
})();
function unzlibSync(data, opts) {
  return inflt(data.subarray(zls(data, opts && opts.dictionary), -4), { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
var dutf8 = function(d) {
  for (var r = "", i2 = 0; ; ) {
    var c = d[i2++];
    var eb = (c > 127) + (c > 223) + (c > 239);
    if (i2 + eb > d.length)
      return { s: r, r: slc(d, i2 - 1) };
    if (!eb)
      r += String.fromCharCode(c);
    else if (eb == 3) {
      c = ((c & 15) << 18 | (d[i2++] & 63) << 12 | (d[i2++] & 63) << 6 | d[i2++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
    } else if (eb & 1)
      r += String.fromCharCode((c & 31) << 6 | d[i2++] & 63);
    else
      r += String.fromCharCode((c & 15) << 12 | (d[i2++] & 63) << 6 | d[i2++] & 63);
  }
};
function strFromU8(dat, latin1) {
  if (latin1) {
    var r = "";
    for (var i2 = 0; i2 < dat.length; i2 += 16384)
      r += String.fromCharCode.apply(null, dat.subarray(i2, i2 + 16384));
    return r;
  } else if (td) {
    return td.decode(dat);
  } else {
    var _a2 = dutf8(dat), s = _a2.s, r = _a2.r;
    if (r.length)
      err(8);
    return s;
  }
}
var slzh = function(d, b) {
  return b + 30 + b2(d, b + 26) + b2(d, b + 28);
};
var zh = function(d, b, z) {
  var fnl = b2(d, b + 28), efl = b2(d, b + 30), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl;
  var _a2 = z64hs(d, es, efl, z, b4(d, b + 20), b4(d, b + 24), b4(d, b + 42)), sc = _a2[0], su = _a2[1], off = _a2[2];
  return [b2(d, b + 10), sc, su, fn, es + efl + b2(d, b + 32), off];
};
var z64hs = function(d, b, l, z, sc, su, off) {
  var nsc = sc == 4294967295, nsu = su == 4294967295, noff = off == 4294967295, e = b + l;
  var nf = nsc + nsu + noff;
  if (z && nf) {
    for (; b + 4 < e; b += 4 + b2(d, b + 2)) {
      if (b2(d, b) == 1) {
        return [
          nsc ? b8(d, b + 4 + 8 * nsu) : sc,
          nsu ? b8(d, b + 4) : su,
          noff ? b8(d, b + 4 + 8 * (nsu + nsc)) : off,
          1
        ];
      }
    }
    if (z < 2)
      err(13);
  }
  return [sc, su, off, 0];
};
function unzipSync(data, opts) {
  var files = {};
  var e = data.length - 22;
  for (; b4(data, e) != 101010256; --e) {
    if (!e || data.length - e > 65558)
      err(13);
  }
  ;
  var c = b2(data, e + 8);
  if (!c)
    return {};
  var o = b4(data, e + 16);
  var z = b4(data, e - 20) == 117853008;
  if (z) {
    var ze = b4(data, e - 12);
    z = b4(data, ze) == 101075792;
    if (z) {
      c = b4(data, ze + 32);
      o = b4(data, ze + 48);
    }
  }
  var fltr = opts && opts.filter;
  for (var i2 = 0; i2 < c; ++i2) {
    var _a2 = zh(data, o, z), c_2 = _a2[0], sc = _a2[1], su = _a2[2], fn = _a2[3], no = _a2[4], off = _a2[5], b = slzh(data, off);
    o = no;
    if (!fltr || fltr({
      name: fn,
      size: sc,
      originalSize: su,
      compression: c_2
    })) {
      if (!c_2)
        files[fn] = slc(data, b, b + sc);
      else if (c_2 == 8)
        files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
      else
        err(14, "unknown compression type " + c_2);
    }
  }
  return files;
}

// ../ThreeSprite/node_modules/.pnpm/iobuffer@6.0.1/node_modules/iobuffer/lib/text.js
function decode(bytes, encoding = "utf8") {
  const decoder = new TextDecoder(encoding);
  return decoder.decode(bytes);
}
var encoder = new TextEncoder();
function encode(str) {
  return encoder.encode(str);
}

// ../ThreeSprite/node_modules/.pnpm/iobuffer@6.0.1/node_modules/iobuffer/lib/iobuffer.js
var defaultByteLength = 1024 * 8;
var hostBigEndian = (() => {
  const array = new Uint8Array(4);
  const view = new Uint32Array(array.buffer);
  return !((view[0] = 1) & array[0]);
})();
var typedArrays = {
  int8: globalThis.Int8Array,
  uint8: globalThis.Uint8Array,
  int16: globalThis.Int16Array,
  uint16: globalThis.Uint16Array,
  int32: globalThis.Int32Array,
  uint32: globalThis.Uint32Array,
  uint64: globalThis.BigUint64Array,
  int64: globalThis.BigInt64Array,
  float32: globalThis.Float32Array,
  float64: globalThis.Float64Array
};
var IOBuffer = class _IOBuffer {
  /**
   * Create a new IOBuffer.
   * @param data - The data to construct the IOBuffer with.
   * If data is a number, it will be the new buffer's length<br>
   * If data is `undefined`, the buffer will be initialized with a default length of 8Kb<br>
   * If data is an ArrayBuffer, SharedArrayBuffer, an ArrayBufferView (Typed Array), an IOBuffer instance,
   * or a Node.js Buffer, a view will be created over the underlying ArrayBuffer.
   * @param options - An object for the options.
   * @returns A new IOBuffer instance.
   */
  constructor(data = defaultByteLength, options = {}) {
    /**
     * Reference to the internal ArrayBuffer object.
     */
    __publicField(this, "buffer");
    /**
     * Byte length of the internal ArrayBuffer.
     */
    __publicField(this, "byteLength");
    /**
     * Byte offset of the internal ArrayBuffer.
     */
    __publicField(this, "byteOffset");
    /**
     * Byte length of the internal ArrayBuffer.
     */
    __publicField(this, "length");
    /**
     * The current offset of the buffer's pointer.
     */
    __publicField(this, "offset");
    __publicField(this, "lastWrittenByte");
    __publicField(this, "littleEndian");
    __publicField(this, "_data");
    __publicField(this, "_mark");
    __publicField(this, "_marks");
    let dataIsGiven = false;
    if (typeof data === "number") {
      data = new ArrayBuffer(data);
    } else {
      dataIsGiven = true;
      this.lastWrittenByte = data.byteLength;
    }
    const offset = options.offset ? options.offset >>> 0 : 0;
    const byteLength = data.byteLength - offset;
    let dvOffset = offset;
    if (ArrayBuffer.isView(data) || data instanceof _IOBuffer) {
      if (data.byteLength !== data.buffer.byteLength) {
        dvOffset = data.byteOffset + offset;
      }
      data = data.buffer;
    }
    if (dataIsGiven) {
      this.lastWrittenByte = byteLength;
    } else {
      this.lastWrittenByte = 0;
    }
    this.buffer = data;
    this.length = byteLength;
    this.byteLength = byteLength;
    this.byteOffset = dvOffset;
    this.offset = 0;
    this.littleEndian = true;
    this._data = new DataView(this.buffer, dvOffset, byteLength);
    this._mark = 0;
    this._marks = [];
  }
  /**
   * Checks if the memory allocated to the buffer is sufficient to store more
   * bytes after the offset.
   * @param byteLength - The needed memory in bytes.
   * @returns `true` if there is sufficient space and `false` otherwise.
   */
  available(byteLength = 1) {
    return this.offset + byteLength <= this.length;
  }
  /**
   * Check if little-endian mode is used for reading and writing multi-byte
   * values.
   * @returns `true` if little-endian mode is used, `false` otherwise.
   */
  isLittleEndian() {
    return this.littleEndian;
  }
  /**
   * Set little-endian mode for reading and writing multi-byte values.
   * @returns This.
   */
  setLittleEndian() {
    this.littleEndian = true;
    return this;
  }
  /**
   * Check if big-endian mode is used for reading and writing multi-byte values.
   * @returns `true` if big-endian mode is used, `false` otherwise.
   */
  isBigEndian() {
    return !this.littleEndian;
  }
  /**
   * Switches to big-endian mode for reading and writing multi-byte values.
   * @returns This.
   */
  setBigEndian() {
    this.littleEndian = false;
    return this;
  }
  /**
   * Move the pointer n bytes forward.
   * @param n - Number of bytes to skip.
   * @returns This.
   */
  skip(n = 1) {
    this.offset += n;
    return this;
  }
  /**
   * Move the pointer n bytes backward.
   * @param n - Number of bytes to move back.
   * @returns This.
   */
  back(n = 1) {
    this.offset -= n;
    return this;
  }
  /**
   * Move the pointer to the given offset.
   * @param offset - The offset to move to.
   * @returns This.
   */
  seek(offset) {
    this.offset = offset;
    return this;
  }
  /**
   * Store the current pointer offset.
   * @see {@link IOBuffer#reset}
   * @returns This.
   */
  mark() {
    this._mark = this.offset;
    return this;
  }
  /**
   * Move the pointer back to the last pointer offset set by mark.
   * @see {@link IOBuffer#mark}
   * @returns This.
   */
  reset() {
    this.offset = this._mark;
    return this;
  }
  /**
   * Push the current pointer offset to the mark stack.
   * @see {@link IOBuffer#popMark}
   * @returns This.
   */
  pushMark() {
    this._marks.push(this.offset);
    return this;
  }
  /**
   * Pop the last pointer offset from the mark stack, and set the current
   * pointer offset to the popped value.
   * @see {@link IOBuffer#pushMark}
   * @returns This.
   */
  popMark() {
    const offset = this._marks.pop();
    if (offset === void 0) {
      throw new Error("Mark stack empty");
    }
    this.seek(offset);
    return this;
  }
  /**
   * Move the pointer offset back to 0.
   * @returns This.
   */
  rewind() {
    this.offset = 0;
    return this;
  }
  /**
   * Make sure the buffer has sufficient memory to write a given byteLength at
   * the current pointer offset.
   * If the buffer's memory is insufficient, this method will create a new
   * buffer (a copy) with a length that is twice (byteLength + current offset).
   * @param byteLength - The needed memory in bytes.
   * @returns This.
   */
  ensureAvailable(byteLength = 1) {
    if (!this.available(byteLength)) {
      const lengthNeeded = this.offset + byteLength;
      const newLength = lengthNeeded * 2;
      const newArray = new Uint8Array(newLength);
      newArray.set(new Uint8Array(this.buffer));
      this.buffer = newArray.buffer;
      this.length = newLength;
      this.byteLength = newLength;
      this._data = new DataView(this.buffer);
    }
    return this;
  }
  /**
   * Read a byte and return false if the byte's value is 0, or true otherwise.
   * Moves pointer forward by one byte.
   * @returns The read boolean.
   */
  readBoolean() {
    return this.readUint8() !== 0;
  }
  /**
   * Read a signed 8-bit integer and move pointer forward by 1 byte.
   * @returns The read byte.
   */
  readInt8() {
    return this._data.getInt8(this.offset++);
  }
  /**
   * Read an unsigned 8-bit integer and move pointer forward by 1 byte.
   * @returns The read byte.
   */
  readUint8() {
    return this._data.getUint8(this.offset++);
  }
  /**
   * Alias for {@link IOBuffer#readUint8}.
   * @returns The read byte.
   */
  readByte() {
    return this.readUint8();
  }
  /**
   * Read `n` bytes and move pointer forward by `n` bytes.
   * @param n - Number of bytes to read.
   * @returns The read bytes.
   */
  readBytes(n = 1) {
    return this.readArray(n, "uint8");
  }
  /**
   * Creates an array of corresponding to the type `type` and size `size`.
   * For example, type `uint8` will create a `Uint8Array`.
   * @param size - size of the resulting array
   * @param type - number type of elements to read
   * @returns The read array.
   */
  readArray(size, type) {
    const bytes = typedArrays[type].BYTES_PER_ELEMENT * size;
    const offset = this.byteOffset + this.offset;
    const slice = this.buffer.slice(offset, offset + bytes);
    if (this.littleEndian === hostBigEndian && type !== "uint8" && type !== "int8") {
      const slice2 = new Uint8Array(this.buffer.slice(offset, offset + bytes));
      slice2.reverse();
      const returnArray2 = new typedArrays[type](slice2.buffer);
      this.offset += bytes;
      returnArray2.reverse();
      return returnArray2;
    }
    const returnArray = new typedArrays[type](slice);
    this.offset += bytes;
    return returnArray;
  }
  /**
   * Read a 16-bit signed integer and move pointer forward by 2 bytes.
   * @returns The read value.
   */
  readInt16() {
    const value = this._data.getInt16(this.offset, this.littleEndian);
    this.offset += 2;
    return value;
  }
  /**
   * Read a 16-bit unsigned integer and move pointer forward by 2 bytes.
   * @returns The read value.
   */
  readUint16() {
    const value = this._data.getUint16(this.offset, this.littleEndian);
    this.offset += 2;
    return value;
  }
  /**
   * Read a 32-bit signed integer and move pointer forward by 4 bytes.
   * @returns The read value.
   */
  readInt32() {
    const value = this._data.getInt32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }
  /**
   * Read a 32-bit unsigned integer and move pointer forward by 4 bytes.
   * @returns The read value.
   */
  readUint32() {
    const value = this._data.getUint32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }
  /**
   * Read a 32-bit floating number and move pointer forward by 4 bytes.
   * @returns The read value.
   */
  readFloat32() {
    const value = this._data.getFloat32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }
  /**
   * Read a 64-bit floating number and move pointer forward by 8 bytes.
   * @returns The read value.
   */
  readFloat64() {
    const value = this._data.getFloat64(this.offset, this.littleEndian);
    this.offset += 8;
    return value;
  }
  /**
   * Read a 64-bit signed integer number and move pointer forward by 8 bytes.
   * @returns The read value.
   */
  readBigInt64() {
    const value = this._data.getBigInt64(this.offset, this.littleEndian);
    this.offset += 8;
    return value;
  }
  /**
   * Read a 64-bit unsigned integer number and move pointer forward by 8 bytes.
   * @returns The read value.
   */
  readBigUint64() {
    const value = this._data.getBigUint64(this.offset, this.littleEndian);
    this.offset += 8;
    return value;
  }
  /**
   * Read a 1-byte ASCII character and move pointer forward by 1 byte.
   * @returns The read character.
   */
  readChar() {
    return String.fromCharCode(this.readInt8());
  }
  /**
   * Read `n` 1-byte ASCII characters and move pointer forward by `n` bytes.
   * @param n - Number of characters to read.
   * @returns The read characters.
   */
  readChars(n = 1) {
    let result = "";
    for (let i2 = 0; i2 < n; i2++) {
      result += this.readChar();
    }
    return result;
  }
  /**
   * Read the next `n` bytes, return a UTF-8 decoded string and move pointer
   * forward by `n` bytes.
   * @param n - Number of bytes to read.
   * @returns The decoded string.
   */
  readUtf8(n = 1) {
    return decode(this.readBytes(n));
  }
  /**
   * Read the next `n` bytes, return a string decoded with `encoding` and move pointer
   * forward by `n` bytes.
   * If no encoding is passed, the function is equivalent to @see {@link IOBuffer#readUtf8}
   * @param n - Number of bytes to read.
   * @param encoding - The encoding to use. Default is 'utf8'.
   * @returns The decoded string.
   */
  decodeText(n = 1, encoding = "utf8") {
    return decode(this.readBytes(n), encoding);
  }
  /**
   * Write 0xff if the passed value is truthy, 0x00 otherwise and move pointer
   * forward by 1 byte.
   * @param value - The value to write.
   * @returns This.
   */
  writeBoolean(value) {
    this.writeUint8(value ? 255 : 0);
    return this;
  }
  /**
   * Write `value` as an 8-bit signed integer and move pointer forward by 1 byte.
   * @param value - The value to write.
   * @returns This.
   */
  writeInt8(value) {
    this.ensureAvailable(1);
    this._data.setInt8(this.offset++, value);
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as an 8-bit unsigned integer and move pointer forward by 1
   * byte.
   * @param value - The value to write.
   * @returns This.
   */
  writeUint8(value) {
    this.ensureAvailable(1);
    this._data.setUint8(this.offset++, value);
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * An alias for {@link IOBuffer#writeUint8}.
   * @param value - The value to write.
   * @returns This.
   */
  writeByte(value) {
    return this.writeUint8(value);
  }
  /**
   * Write all elements of `bytes` as uint8 values and move pointer forward by
   * `bytes.length` bytes.
   * @param bytes - The array of bytes to write.
   * @returns This.
   */
  writeBytes(bytes) {
    this.ensureAvailable(bytes.length);
    for (let i2 = 0; i2 < bytes.length; i2++) {
      this._data.setUint8(this.offset++, bytes[i2]);
    }
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as a 16-bit signed integer and move pointer forward by 2
   * bytes.
   * @param value - The value to write.
   * @returns This.
   */
  writeInt16(value) {
    this.ensureAvailable(2);
    this._data.setInt16(this.offset, value, this.littleEndian);
    this.offset += 2;
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as a 16-bit unsigned integer and move pointer forward by 2
   * bytes.
   * @param value - The value to write.
   * @returns This.
   */
  writeUint16(value) {
    this.ensureAvailable(2);
    this._data.setUint16(this.offset, value, this.littleEndian);
    this.offset += 2;
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as a 32-bit signed integer and move pointer forward by 4
   * bytes.
   * @param value - The value to write.
   * @returns This.
   */
  writeInt32(value) {
    this.ensureAvailable(4);
    this._data.setInt32(this.offset, value, this.littleEndian);
    this.offset += 4;
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as a 32-bit unsigned integer and move pointer forward by 4
   * bytes.
   * @param value - The value to write.
   * @returns This.
   */
  writeUint32(value) {
    this.ensureAvailable(4);
    this._data.setUint32(this.offset, value, this.littleEndian);
    this.offset += 4;
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as a 32-bit floating number and move pointer forward by 4
   * bytes.
   * @param value - The value to write.
   * @returns This.
   */
  writeFloat32(value) {
    this.ensureAvailable(4);
    this._data.setFloat32(this.offset, value, this.littleEndian);
    this.offset += 4;
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as a 64-bit floating number and move pointer forward by 8
   * bytes.
   * @param value - The value to write.
   * @returns This.
   */
  writeFloat64(value) {
    this.ensureAvailable(8);
    this._data.setFloat64(this.offset, value, this.littleEndian);
    this.offset += 8;
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as a 64-bit signed bigint and move pointer forward by 8
   * bytes.
   * @param value - The value to write.
   * @returns This.
   */
  writeBigInt64(value) {
    this.ensureAvailable(8);
    this._data.setBigInt64(this.offset, value, this.littleEndian);
    this.offset += 8;
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as a 64-bit unsigned bigint and move pointer forward by 8
   * bytes.
   * @param value - The value to write.
   * @returns This.
   */
  writeBigUint64(value) {
    this.ensureAvailable(8);
    this._data.setBigUint64(this.offset, value, this.littleEndian);
    this.offset += 8;
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write the charCode of `str`'s first character as an 8-bit unsigned integer
   * and move pointer forward by 1 byte.
   * @param str - The character to write.
   * @returns This.
   */
  writeChar(str) {
    return this.writeUint8(str.charCodeAt(0));
  }
  /**
   * Write the charCodes of all `str`'s characters as 8-bit unsigned integers
   * and move pointer forward by `str.length` bytes.
   * @param str - The characters to write.
   * @returns This.
   */
  writeChars(str) {
    for (let i2 = 0; i2 < str.length; i2++) {
      this.writeUint8(str.charCodeAt(i2));
    }
    return this;
  }
  /**
   * UTF-8 encode and write `str` to the current pointer offset and move pointer
   * forward according to the encoded length.
   * @param str - The string to write.
   * @returns This.
   */
  writeUtf8(str) {
    return this.writeBytes(encode(str));
  }
  /**
   * Export a Uint8Array view of the internal buffer.
   * The view starts at the byte offset and its length
   * is calculated to stop at the last written byte or the original length.
   * @returns A new Uint8Array view.
   */
  toArray() {
    return new Uint8Array(this.buffer, this.byteOffset, this.lastWrittenByte);
  }
  /**
   *  Get the total number of bytes written so far, regardless of the current offset.
   * @returns - Total number of bytes.
   */
  getWrittenByteLength() {
    return this.lastWrittenByte - this.byteOffset;
  }
  /**
   * Update the last written byte offset
   * @private
   */
  _updateLastWrittenByte() {
    if (this.offset > this.lastWrittenByte) {
      this.lastWrittenByte = this.offset;
    }
  }
};

// ../ThreeSprite/node_modules/.pnpm/fast-png@8.0.0/node_modules/fast-png/lib/helpers/crc.js
var crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 3988292384 ^ c >>> 1;
    } else {
      c = c >>> 1;
    }
  }
  crcTable[n] = c;
}
var initialCrc = 4294967295;
function updateCrc(currentCrc, data, length) {
  let c = currentCrc;
  for (let n = 0; n < length; n++) {
    c = crcTable[(c ^ data[n]) & 255] ^ c >>> 8;
  }
  return c;
}
function crc(data, length) {
  return (updateCrc(initialCrc, data, length) ^ initialCrc) >>> 0;
}
function checkCrc(buffer, crcLength, chunkName) {
  const expectedCrc = buffer.readUint32();
  const actualCrc = crc(new Uint8Array(buffer.buffer, buffer.byteOffset + buffer.offset - crcLength - 4, crcLength), crcLength);
  if (actualCrc !== expectedCrc) {
    throw new Error(`CRC mismatch for chunk ${chunkName}. Expected ${expectedCrc}, found ${actualCrc}`);
  }
}
function writeCrc(buffer, length) {
  buffer.writeUint32(crc(new Uint8Array(buffer.buffer, buffer.byteOffset + buffer.offset - length, length), length));
}

// ../ThreeSprite/node_modules/.pnpm/fast-png@8.0.0/node_modules/fast-png/lib/helpers/unfilter.js
function unfilterNone(currentLine, newLine, bytesPerLine) {
  for (let i2 = 0; i2 < bytesPerLine; i2++) {
    newLine[i2] = currentLine[i2];
  }
}
function unfilterSub(currentLine, newLine, bytesPerLine, bytesPerPixel) {
  let i2 = 0;
  for (; i2 < bytesPerPixel; i2++) {
    newLine[i2] = currentLine[i2];
  }
  for (; i2 < bytesPerLine; i2++) {
    newLine[i2] = currentLine[i2] + newLine[i2 - bytesPerPixel] & 255;
  }
}
function unfilterUp(currentLine, newLine, prevLine, bytesPerLine) {
  let i2 = 0;
  if (prevLine.length === 0) {
    for (; i2 < bytesPerLine; i2++) {
      newLine[i2] = currentLine[i2];
    }
  } else {
    for (; i2 < bytesPerLine; i2++) {
      newLine[i2] = currentLine[i2] + prevLine[i2] & 255;
    }
  }
}
function unfilterAverage(currentLine, newLine, prevLine, bytesPerLine, bytesPerPixel) {
  let i2 = 0;
  if (prevLine.length === 0) {
    for (; i2 < bytesPerPixel; i2++) {
      newLine[i2] = currentLine[i2];
    }
    for (; i2 < bytesPerLine; i2++) {
      newLine[i2] = currentLine[i2] + (newLine[i2 - bytesPerPixel] >> 1) & 255;
    }
  } else {
    for (; i2 < bytesPerPixel; i2++) {
      newLine[i2] = currentLine[i2] + (prevLine[i2] >> 1) & 255;
    }
    for (; i2 < bytesPerLine; i2++) {
      newLine[i2] = currentLine[i2] + (newLine[i2 - bytesPerPixel] + prevLine[i2] >> 1) & 255;
    }
  }
}
function unfilterPaeth(currentLine, newLine, prevLine, bytesPerLine, bytesPerPixel) {
  let i2 = 0;
  if (prevLine.length === 0) {
    for (; i2 < bytesPerPixel; i2++) {
      newLine[i2] = currentLine[i2];
    }
    for (; i2 < bytesPerLine; i2++) {
      newLine[i2] = currentLine[i2] + newLine[i2 - bytesPerPixel] & 255;
    }
  } else {
    for (; i2 < bytesPerPixel; i2++) {
      newLine[i2] = currentLine[i2] + prevLine[i2] & 255;
    }
    for (; i2 < bytesPerLine; i2++) {
      newLine[i2] = currentLine[i2] + paethPredictor(newLine[i2 - bytesPerPixel], prevLine[i2], prevLine[i2 - bytesPerPixel]) & 255;
    }
  }
}
function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc)
    return a;
  else if (pb <= pc)
    return b;
  else
    return c;
}

// ../ThreeSprite/node_modules/.pnpm/fast-png@8.0.0/node_modules/fast-png/lib/helpers/apply_unfilter.js
function applyUnfilter(filterType, currentLine, newLine, prevLine, passLineBytes, bytesPerPixel) {
  switch (filterType) {
    case 0:
      unfilterNone(currentLine, newLine, passLineBytes);
      break;
    case 1:
      unfilterSub(currentLine, newLine, passLineBytes, bytesPerPixel);
      break;
    case 2:
      unfilterUp(currentLine, newLine, prevLine, passLineBytes);
      break;
    case 3:
      unfilterAverage(currentLine, newLine, prevLine, passLineBytes, bytesPerPixel);
      break;
    case 4:
      unfilterPaeth(currentLine, newLine, prevLine, passLineBytes, bytesPerPixel);
      break;
    default:
      throw new Error(`Unsupported filter: ${filterType}`);
  }
}

// ../ThreeSprite/node_modules/.pnpm/fast-png@8.0.0/node_modules/fast-png/lib/helpers/decode_interlace_adam7.js
var uint16 = new Uint16Array([255]);
var uint8 = new Uint8Array(uint16.buffer);
var osIsLittleEndian = uint8[0] === 255;
function decodeInterlaceAdam7(params) {
  const { data, width, height, channels, depth } = params;
  const passes = [
    { x: 0, y: 0, xStep: 8, yStep: 8 },
    // Pass 1
    { x: 4, y: 0, xStep: 8, yStep: 8 },
    // Pass 2
    { x: 0, y: 4, xStep: 4, yStep: 8 },
    // Pass 3
    { x: 2, y: 0, xStep: 4, yStep: 4 },
    // Pass 4
    { x: 0, y: 2, xStep: 2, yStep: 4 },
    // Pass 5
    { x: 1, y: 0, xStep: 2, yStep: 2 },
    // Pass 6
    { x: 0, y: 1, xStep: 1, yStep: 2 }
    // Pass 7
  ];
  const bytesPerPixel = Math.ceil(depth / 8) * channels;
  const resultData = new Uint8Array(height * width * bytesPerPixel);
  let offset = 0;
  for (let passIndex = 0; passIndex < 7; passIndex++) {
    const pass = passes[passIndex];
    const passWidth = Math.ceil((width - pass.x) / pass.xStep);
    const passHeight = Math.ceil((height - pass.y) / pass.yStep);
    if (passWidth <= 0 || passHeight <= 0)
      continue;
    const passLineBytes = passWidth * bytesPerPixel;
    const prevLine = new Uint8Array(passLineBytes);
    for (let y = 0; y < passHeight; y++) {
      const filterType = data[offset++];
      const currentLine = data.subarray(offset, offset + passLineBytes);
      offset += passLineBytes;
      const newLine = new Uint8Array(passLineBytes);
      applyUnfilter(filterType, currentLine, newLine, prevLine, passLineBytes, bytesPerPixel);
      prevLine.set(newLine);
      for (let x2 = 0; x2 < passWidth; x2++) {
        const outputX = pass.x + x2 * pass.xStep;
        const outputY = pass.y + y * pass.yStep;
        if (outputX >= width || outputY >= height)
          continue;
        for (let i2 = 0; i2 < bytesPerPixel; i2++) {
          resultData[(outputY * width + outputX) * bytesPerPixel + i2] = newLine[x2 * bytesPerPixel + i2];
        }
      }
    }
  }
  if (depth === 16) {
    const uint16Data = new Uint16Array(resultData.buffer);
    if (osIsLittleEndian) {
      for (let k = 0; k < uint16Data.length; k++) {
        uint16Data[k] = swap16(uint16Data[k]);
      }
    }
    return uint16Data;
  } else {
    return resultData;
  }
}
function swap16(val) {
  return (val & 255) << 8 | val >> 8 & 255;
}

// ../ThreeSprite/node_modules/.pnpm/fast-png@8.0.0/node_modules/fast-png/lib/helpers/decode_interlace_null.js
var uint162 = new Uint16Array([255]);
var uint82 = new Uint8Array(uint162.buffer);
var osIsLittleEndian2 = uint82[0] === 255;
var empty = new Uint8Array(0);
function decodeInterlaceNull(params) {
  const { data, width, height, channels, depth } = params;
  const bytesPerPixel = Math.ceil(depth / 8) * channels;
  const bytesPerLine = Math.ceil(depth / 8 * channels * width);
  const newData = new Uint8Array(height * bytesPerLine);
  let prevLine = empty;
  let offset = 0;
  let currentLine;
  let newLine;
  for (let i2 = 0; i2 < height; i2++) {
    currentLine = data.subarray(offset + 1, offset + 1 + bytesPerLine);
    newLine = newData.subarray(i2 * bytesPerLine, (i2 + 1) * bytesPerLine);
    switch (data[offset]) {
      case 0:
        unfilterNone(currentLine, newLine, bytesPerLine);
        break;
      case 1:
        unfilterSub(currentLine, newLine, bytesPerLine, bytesPerPixel);
        break;
      case 2:
        unfilterUp(currentLine, newLine, prevLine, bytesPerLine);
        break;
      case 3:
        unfilterAverage(currentLine, newLine, prevLine, bytesPerLine, bytesPerPixel);
        break;
      case 4:
        unfilterPaeth(currentLine, newLine, prevLine, bytesPerLine, bytesPerPixel);
        break;
      default:
        throw new Error(`Unsupported filter: ${data[offset]}`);
    }
    prevLine = newLine;
    offset += bytesPerLine + 1;
  }
  if (depth === 16) {
    const uint16Data = new Uint16Array(newData.buffer);
    if (osIsLittleEndian2) {
      for (let k = 0; k < uint16Data.length; k++) {
        uint16Data[k] = swap162(uint16Data[k]);
      }
    }
    return uint16Data;
  } else {
    return newData;
  }
}
function swap162(val) {
  return (val & 255) << 8 | val >> 8 & 255;
}

// ../ThreeSprite/node_modules/.pnpm/fast-png@8.0.0/node_modules/fast-png/lib/helpers/signature.js
var pngSignature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
function writeSignature(buffer) {
  buffer.writeBytes(pngSignature);
}
function checkSignature(buffer) {
  if (!hasPngSignature(buffer.readBytes(pngSignature.length))) {
    throw new Error("wrong PNG signature");
  }
}
function hasPngSignature(array) {
  if (array.length < pngSignature.length) {
    return false;
  }
  for (let i2 = 0; i2 < pngSignature.length; i2++) {
    if (array[i2] !== pngSignature[i2]) {
      return false;
    }
  }
  return true;
}

// ../ThreeSprite/node_modules/.pnpm/fast-png@8.0.0/node_modules/fast-png/lib/helpers/text.js
var textChunkName = "tEXt";
var NULL = 0;
var latin1Decoder = new TextDecoder("latin1");
function validateKeyword(keyword) {
  validateLatin1(keyword);
  if (keyword.length === 0 || keyword.length > 79) {
    throw new Error("keyword length must be between 1 and 79");
  }
}
var latin1Regex = /^[\u0000-\u00FF]*$/;
function validateLatin1(text) {
  if (!latin1Regex.test(text)) {
    throw new Error("invalid latin1 text");
  }
}
function decodetEXt(text, buffer, length) {
  const keyword = readKeyword(buffer);
  text[keyword] = readLatin1(buffer, length - keyword.length - 1);
}
function encodetEXt(buffer, keyword, text) {
  validateKeyword(keyword);
  validateLatin1(text);
  const length = keyword.length + 1 + text.length;
  buffer.writeUint32(length);
  buffer.writeChars(textChunkName);
  buffer.writeChars(keyword);
  buffer.writeByte(NULL);
  buffer.writeChars(text);
  writeCrc(buffer, length + 4);
}
function readKeyword(buffer) {
  buffer.mark();
  while (buffer.readByte() !== NULL) {
  }
  const end = buffer.offset;
  buffer.reset();
  const keyword = latin1Decoder.decode(buffer.readBytes(end - buffer.offset - 1));
  buffer.skip(1);
  validateKeyword(keyword);
  return keyword;
}
function readLatin1(buffer, length) {
  return latin1Decoder.decode(buffer.readBytes(length));
}

// ../ThreeSprite/node_modules/.pnpm/fast-png@8.0.0/node_modules/fast-png/lib/internal_types.js
var ColorType = {
  UNKNOWN: -1,
  GREYSCALE: 0,
  TRUECOLOUR: 2,
  INDEXED_COLOUR: 3,
  GREYSCALE_ALPHA: 4,
  TRUECOLOUR_ALPHA: 6
};
var CompressionMethod = {
  UNKNOWN: -1,
  DEFLATE: 0
};
var FilterMethod = {
  UNKNOWN: -1,
  ADAPTIVE: 0
};
var InterlaceMethod = {
  UNKNOWN: -1,
  NO_INTERLACE: 0,
  ADAM7: 1
};
var DisposeOpType = {
  NONE: 0,
  BACKGROUND: 1,
  PREVIOUS: 2
};
var BlendOpType = {
  SOURCE: 0,
  OVER: 1
};

// ../ThreeSprite/node_modules/.pnpm/fast-png@8.0.0/node_modules/fast-png/lib/png_decoder.js
var PngDecoder = class extends IOBuffer {
  constructor(data, options = {}) {
    super(data);
    __publicField(this, "_checkCrc");
    __publicField(this, "_inflator");
    __publicField(this, "_png");
    __publicField(this, "_apng");
    __publicField(this, "_end");
    __publicField(this, "_hasPalette");
    __publicField(this, "_palette");
    __publicField(this, "_hasTransparency");
    __publicField(this, "_transparency");
    __publicField(this, "_compressionMethod");
    __publicField(this, "_filterMethod");
    __publicField(this, "_interlaceMethod");
    __publicField(this, "_colorType");
    __publicField(this, "_isAnimated");
    __publicField(this, "_numberOfFrames");
    __publicField(this, "_numberOfPlays");
    __publicField(this, "_frames");
    __publicField(this, "_writingDataChunks");
    __publicField(this, "_chunks");
    __publicField(this, "_inflatorResult");
    const { checkCrc: checkCrc2 = false } = options;
    this._checkCrc = checkCrc2;
    this._inflator = new Unzlib((chunk, final) => {
      this._chunks.push(chunk);
      if (final) {
        const totalLength = this._chunks.reduce((sum, c) => sum + c.length, 0);
        this._inflatorResult = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk2 of this._chunks) {
          this._inflatorResult.set(chunk2, offset);
          offset += chunk2.length;
        }
        this._chunks = [];
      }
    });
    this._chunks = [];
    this._png = {
      width: -1,
      height: -1,
      channels: -1,
      data: new Uint8Array(0),
      depth: 1,
      text: {}
    };
    this._apng = {
      width: -1,
      height: -1,
      channels: -1,
      depth: 1,
      numberOfFrames: 1,
      numberOfPlays: 0,
      text: {},
      frames: []
    };
    this._end = false;
    this._hasPalette = false;
    this._palette = [];
    this._hasTransparency = false;
    this._transparency = new Uint16Array(0);
    this._compressionMethod = CompressionMethod.UNKNOWN;
    this._filterMethod = FilterMethod.UNKNOWN;
    this._interlaceMethod = InterlaceMethod.UNKNOWN;
    this._colorType = ColorType.UNKNOWN;
    this._isAnimated = false;
    this._numberOfFrames = 1;
    this._numberOfPlays = 0;
    this._frames = [];
    this._writingDataChunks = false;
    this._inflatorResult = new Uint8Array(0);
    this.setBigEndian();
  }
  decode() {
    checkSignature(this);
    while (!this._end) {
      const length = this.readUint32();
      const type = this.readChars(4);
      this.decodeChunk(length, type);
    }
    this._inflator.push(new Uint8Array(0), true);
    this.decodeImage();
    return this._png;
  }
  decodeApng() {
    checkSignature(this);
    while (!this._end) {
      const length = this.readUint32();
      const type = this.readChars(4);
      this.decodeApngChunk(length, type);
    }
    this.decodeApngImage();
    return this._apng;
  }
  // https://www.w3.org/TR/PNG/#5Chunk-layout
  decodeChunk(length, type) {
    const offset = this.offset;
    switch (type) {
      // 11.2 Critical chunks
      case "IHDR":
        this.decodeIHDR();
        break;
      case "PLTE":
        this.decodePLTE(length);
        break;
      case "IDAT":
        this.decodeIDAT(length);
        break;
      case "IEND":
        this._end = true;
        break;
      // 11.3 Ancillary chunks
      case "tRNS":
        this.decodetRNS(length);
        break;
      case "iCCP":
        this.decodeiCCP(length);
        break;
      case textChunkName:
        decodetEXt(this._png.text, this, length);
        break;
      case "pHYs":
        this.decodepHYs();
        break;
      default:
        this.skip(length);
        break;
    }
    if (this.offset - offset !== length) {
      throw new Error(`Length mismatch while decoding chunk ${type}`);
    }
    if (this._checkCrc) {
      checkCrc(this, length + 4, type);
    } else {
      this.skip(4);
    }
  }
  decodeApngChunk(length, type) {
    const offset = this.offset;
    if (type !== "fdAT" && type !== "IDAT" && this._writingDataChunks) {
      this.pushDataToFrame();
    }
    switch (type) {
      case "acTL":
        this.decodeACTL();
        break;
      case "fcTL":
        this.decodeFCTL();
        break;
      case "fdAT":
        this.decodeFDAT(length);
        break;
      default:
        this.decodeChunk(length, type);
        this.offset = offset + length;
        break;
    }
    if (this.offset - offset !== length) {
      throw new Error(`Length mismatch while decoding chunk ${type}`);
    }
    if (this._checkCrc) {
      checkCrc(this, length + 4, type);
    } else {
      this.skip(4);
    }
  }
  // https://www.w3.org/TR/PNG/#11IHDR
  decodeIHDR() {
    const image = this._png;
    image.width = this.readUint32();
    image.height = this.readUint32();
    image.depth = checkBitDepth(this.readUint8());
    const colorType = this.readUint8();
    this._colorType = colorType;
    let channels;
    switch (colorType) {
      case ColorType.GREYSCALE:
        channels = 1;
        break;
      case ColorType.TRUECOLOUR:
        channels = 3;
        break;
      case ColorType.INDEXED_COLOUR:
        channels = 1;
        break;
      case ColorType.GREYSCALE_ALPHA:
        channels = 2;
        break;
      case ColorType.TRUECOLOUR_ALPHA:
        channels = 4;
        break;
      // Kept for exhaustiveness.
      // eslint-disable-next-line unicorn/no-useless-switch-case
      case ColorType.UNKNOWN:
      default:
        throw new Error(`Unknown color type: ${colorType}`);
    }
    this._png.channels = channels;
    this._compressionMethod = this.readUint8();
    if (this._compressionMethod !== CompressionMethod.DEFLATE) {
      throw new Error(`Unsupported compression method: ${this._compressionMethod}`);
    }
    this._filterMethod = this.readUint8();
    this._interlaceMethod = this.readUint8();
  }
  decodeACTL() {
    this._numberOfFrames = this.readUint32();
    this._numberOfPlays = this.readUint32();
    this._isAnimated = true;
  }
  decodeFCTL() {
    const image = {
      sequenceNumber: this.readUint32(),
      width: this.readUint32(),
      height: this.readUint32(),
      xOffset: this.readUint32(),
      yOffset: this.readUint32(),
      delayNumber: this.readUint16(),
      delayDenominator: this.readUint16(),
      disposeOp: this.readUint8(),
      blendOp: this.readUint8(),
      data: new Uint8Array(0)
    };
    this._frames.push(image);
  }
  // https://www.w3.org/TR/PNG/#11PLTE
  decodePLTE(length) {
    if (length % 3 !== 0) {
      throw new RangeError(`PLTE field length must be a multiple of 3. Got ${length}`);
    }
    const l = length / 3;
    this._hasPalette = true;
    const palette = [];
    this._palette = palette;
    for (let i2 = 0; i2 < l; i2++) {
      palette.push([this.readUint8(), this.readUint8(), this.readUint8()]);
    }
  }
  // https://www.w3.org/TR/PNG/#11IDAT
  decodeIDAT(length) {
    this._writingDataChunks = true;
    const dataLength = length;
    const dataOffset = this.offset + this.byteOffset;
    try {
      this._inflator.push(new Uint8Array(this.buffer, dataOffset, dataLength), false);
    } catch (error) {
      throw new Error("Error while decompressing the data:", { cause: error });
    }
    this.skip(length);
  }
  decodeFDAT(length) {
    this._writingDataChunks = true;
    let dataLength = length;
    let dataOffset = this.offset + this.byteOffset;
    dataOffset += 4;
    dataLength -= 4;
    try {
      this._inflator.push(new Uint8Array(this.buffer, dataOffset, dataLength), false);
    } catch (error) {
      throw new Error("Error while decompressing the data:", { cause: error });
    }
    this.skip(length);
  }
  // https://www.w3.org/TR/PNG/#11tRNS
  decodetRNS(length) {
    switch (this._colorType) {
      case ColorType.GREYSCALE:
      case ColorType.TRUECOLOUR: {
        if (length % 2 !== 0) {
          throw new RangeError(`tRNS chunk length must be a multiple of 2. Got ${length}`);
        }
        if (length / 2 > this._png.width * this._png.height) {
          throw new Error(`tRNS chunk contains more alpha values than there are pixels (${length / 2} vs ${this._png.width * this._png.height})`);
        }
        this._hasTransparency = true;
        this._transparency = new Uint16Array(length / 2);
        for (let i2 = 0; i2 < length / 2; i2++) {
          this._transparency[i2] = this.readUint16();
        }
        break;
      }
      case ColorType.INDEXED_COLOUR: {
        if (length > this._palette.length) {
          throw new Error(`tRNS chunk contains more alpha values than there are palette colors (${length} vs ${this._palette.length})`);
        }
        let i2 = 0;
        for (; i2 < length; i2++) {
          const alpha = this.readByte();
          this._palette[i2].push(alpha);
        }
        for (; i2 < this._palette.length; i2++) {
          this._palette[i2].push(255);
        }
        break;
      }
      // Kept for exhaustiveness.
      /* eslint-disable unicorn/no-useless-switch-case */
      case ColorType.UNKNOWN:
      case ColorType.GREYSCALE_ALPHA:
      case ColorType.TRUECOLOUR_ALPHA:
      default: {
        throw new Error(`tRNS chunk is not supported for color type ${this._colorType}`);
      }
    }
  }
  // https://www.w3.org/TR/PNG/#11iCCP
  decodeiCCP(length) {
    const name = readKeyword(this);
    const compressionMethod = this.readUint8();
    if (compressionMethod !== CompressionMethod.DEFLATE) {
      throw new Error(`Unsupported iCCP compression method: ${compressionMethod}`);
    }
    const compressedProfile = this.readBytes(length - name.length - 2);
    this._png.iccEmbeddedProfile = {
      name,
      profile: unzlibSync(compressedProfile)
    };
  }
  // https://www.w3.org/TR/PNG/#11pHYs
  decodepHYs() {
    const ppuX = this.readUint32();
    const ppuY = this.readUint32();
    const unitSpecifier = this.readByte();
    this._png.resolution = {
      x: ppuX,
      y: ppuY,
      unit: unitSpecifier
    };
  }
  decodeApngImage() {
    this._apng.width = this._png.width;
    this._apng.height = this._png.height;
    this._apng.channels = this._png.channels;
    this._apng.depth = this._png.depth;
    this._apng.numberOfFrames = this._numberOfFrames;
    this._apng.numberOfPlays = this._numberOfPlays;
    this._apng.text = this._png.text;
    this._apng.resolution = this._png.resolution;
    for (let i2 = 0; i2 < this._numberOfFrames; i2++) {
      const newFrame = {
        sequenceNumber: this._frames[i2].sequenceNumber,
        delayNumber: this._frames[i2].delayNumber,
        delayDenominator: this._frames[i2].delayDenominator,
        data: this._apng.depth === 8 ? new Uint8Array(this._apng.width * this._apng.height * this._apng.channels) : new Uint16Array(this._apng.width * this._apng.height * this._apng.channels)
      };
      const frame = this._frames.at(i2);
      if (frame) {
        frame.data = decodeInterlaceNull({
          data: frame.data,
          width: frame.width,
          height: frame.height,
          channels: this._apng.channels,
          depth: this._apng.depth
        });
        if (this._hasPalette) {
          this._apng.palette = this._palette;
        }
        if (this._hasTransparency) {
          this._apng.transparency = this._transparency;
        }
        if (i2 === 0 || frame.xOffset === 0 && frame.yOffset === 0 && frame.width === this._png.width && frame.height === this._png.height) {
          newFrame.data = frame.data;
        } else {
          const prevFrame = this._apng.frames.at(i2 - 1);
          this.disposeFrame(frame, prevFrame, newFrame);
          this.addFrameDataToCanvas(newFrame, frame);
        }
        this._apng.frames.push(newFrame);
      }
    }
    return this._apng;
  }
  disposeFrame(frame, prevFrame, imageFrame) {
    switch (frame.disposeOp) {
      case DisposeOpType.NONE:
        break;
      case DisposeOpType.BACKGROUND:
        for (let row = 0; row < this._png.height; row++) {
          for (let col = 0; col < this._png.width; col++) {
            const index = (row * frame.width + col) * this._png.channels;
            for (let channel = 0; channel < this._png.channels; channel++) {
              imageFrame.data[index + channel] = 0;
            }
          }
        }
        break;
      case DisposeOpType.PREVIOUS:
        imageFrame.data.set(prevFrame.data);
        break;
      default:
        throw new Error("Unknown disposeOp");
    }
  }
  addFrameDataToCanvas(imageFrame, frame) {
    const maxValue = 1 << this._png.depth;
    const calculatePixelIndices = (row, col) => {
      const index = ((row + frame.yOffset) * this._png.width + frame.xOffset + col) * this._png.channels;
      const frameIndex = (row * frame.width + col) * this._png.channels;
      return { index, frameIndex };
    };
    switch (frame.blendOp) {
      case BlendOpType.SOURCE:
        for (let row = 0; row < frame.height; row++) {
          for (let col = 0; col < frame.width; col++) {
            const { index, frameIndex } = calculatePixelIndices(row, col);
            for (let channel = 0; channel < this._png.channels; channel++) {
              imageFrame.data[index + channel] = frame.data[frameIndex + channel];
            }
          }
        }
        break;
      // https://www.w3.org/TR/png-3/#13Alpha-channel-processing
      case BlendOpType.OVER:
        for (let row = 0; row < frame.height; row++) {
          for (let col = 0; col < frame.width; col++) {
            const { index, frameIndex } = calculatePixelIndices(row, col);
            for (let channel = 0; channel < this._png.channels; channel++) {
              const sourceAlpha = frame.data[frameIndex + this._png.channels - 1] / maxValue;
              const foregroundValue = channel % (this._png.channels - 1) === 0 ? 1 : frame.data[frameIndex + channel];
              const value = Math.floor(sourceAlpha * foregroundValue + (1 - sourceAlpha) * imageFrame.data[index + channel]);
              imageFrame.data[index + channel] += value;
            }
          }
        }
        break;
      default:
        throw new Error("Unknown blendOp");
    }
  }
  decodeImage() {
    const data = this._inflatorResult;
    if (this._filterMethod !== FilterMethod.ADAPTIVE) {
      throw new Error(`Filter method ${this._filterMethod} not supported`);
    }
    if (this._interlaceMethod === InterlaceMethod.NO_INTERLACE) {
      this._png.data = decodeInterlaceNull({
        data,
        width: this._png.width,
        height: this._png.height,
        channels: this._png.channels,
        depth: this._png.depth
      });
    } else if (this._interlaceMethod === InterlaceMethod.ADAM7) {
      this._png.data = decodeInterlaceAdam7({
        data,
        width: this._png.width,
        height: this._png.height,
        channels: this._png.channels,
        depth: this._png.depth
      });
    } else {
      throw new Error(`Interlace method ${this._interlaceMethod} not supported`);
    }
    if (this._hasPalette) {
      this._png.palette = this._palette;
    }
    if (this._hasTransparency) {
      this._png.transparency = this._transparency;
    }
  }
  pushDataToFrame() {
    this._inflator.push(new Uint8Array(0), true);
    const result = this._inflatorResult;
    const lastFrame = this._frames.at(-1);
    if (lastFrame) {
      lastFrame.data = result;
    } else {
      this._frames.push({
        sequenceNumber: 0,
        width: this._png.width,
        height: this._png.height,
        xOffset: 0,
        yOffset: 0,
        delayNumber: 0,
        delayDenominator: 0,
        disposeOp: DisposeOpType.NONE,
        blendOp: BlendOpType.SOURCE,
        data: result
      });
    }
    this._inflator = new Unzlib((chunk, final) => {
      this._chunks.push(chunk);
      if (final) {
        const totalLength = this._chunks.reduce((sum, c) => sum + c.length, 0);
        this._inflatorResult = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk2 of this._chunks) {
          this._inflatorResult.set(chunk2, offset);
          offset += chunk2.length;
        }
        this._chunks = [];
      }
    });
    this._chunks = [];
    this._writingDataChunks = false;
  }
};
function checkBitDepth(value) {
  if (value !== 1 && value !== 2 && value !== 4 && value !== 8 && value !== 16) {
    throw new Error(`invalid bit depth: ${value}`);
  }
  return value;
}

// ../ThreeSprite/node_modules/.pnpm/fast-png@8.0.0/node_modules/fast-png/lib/png_encoder.js
var defaultZlibOptions = {
  level: 3
};
var PngEncoder = class extends IOBuffer {
  constructor(data, options = {}) {
    super();
    __publicField(this, "_png");
    __publicField(this, "_zlibOptions");
    __publicField(this, "_colorType");
    __publicField(this, "_interlaceMethod");
    this._colorType = ColorType.UNKNOWN;
    this._zlibOptions = { ...defaultZlibOptions, ...options.zlib };
    this._png = this._checkData(data);
    this._interlaceMethod = (options.interlace === "Adam7" ? InterlaceMethod.ADAM7 : InterlaceMethod.NO_INTERLACE) ?? InterlaceMethod.NO_INTERLACE;
    this.setBigEndian();
  }
  encode() {
    writeSignature(this);
    this.encodeIHDR();
    if (this._png.palette) {
      this.encodePLTE();
      if (this._png.palette[0].length === 4) {
        this.encodeTRNS();
      }
    }
    this.encodeData();
    if (this._png.text) {
      for (const [keyword, text] of Object.entries(this._png.text)) {
        encodetEXt(this, keyword, text);
      }
    }
    this.encodeIEND();
    return this.toArray();
  }
  // https://www.w3.org/TR/PNG/#11IHDR
  encodeIHDR() {
    this.writeUint32(13);
    this.writeChars("IHDR");
    this.writeUint32(this._png.width);
    this.writeUint32(this._png.height);
    this.writeByte(this._png.depth);
    this.writeByte(this._colorType);
    this.writeByte(CompressionMethod.DEFLATE);
    this.writeByte(FilterMethod.ADAPTIVE);
    this.writeByte(this._interlaceMethod);
    writeCrc(this, 17);
  }
  // https://www.w3.org/TR/PNG/#11IEND
  encodeIEND() {
    this.writeUint32(0);
    this.writeChars("IEND");
    writeCrc(this, 4);
  }
  encodePLTE() {
    const paletteLength = this._png.palette?.length * 3;
    this.writeUint32(paletteLength);
    this.writeChars("PLTE");
    for (const color of this._png.palette) {
      this.writeByte(color[0]);
      this.writeByte(color[1]);
      this.writeByte(color[2]);
    }
    writeCrc(this, 4 + paletteLength);
  }
  encodeTRNS() {
    const alpha = this._png.palette.filter((color) => {
      return color.at(-1) !== 255;
    });
    this.writeUint32(alpha.length);
    this.writeChars("tRNS");
    for (const el of alpha) {
      this.writeByte(el.at(-1));
    }
    writeCrc(this, 4 + alpha.length);
  }
  // https://www.w3.org/TR/PNG/#11IDAT
  encodeIDAT(data) {
    this.writeUint32(data.length);
    this.writeChars("IDAT");
    this.writeBytes(data);
    writeCrc(this, data.length + 4);
  }
  encodeData() {
    const { width, height, channels, depth, data } = this._png;
    const slotsPerLine = depth <= 8 ? Math.ceil(width * depth / 8) * channels : Math.ceil(width * depth / 8 * channels / 2);
    const newData = new IOBuffer().setBigEndian();
    let offset = 0;
    if (this._interlaceMethod === InterlaceMethod.NO_INTERLACE) {
      for (let i2 = 0; i2 < height; i2++) {
        newData.writeByte(0);
        if (depth === 16) {
          offset = writeDataUint16(data, newData, slotsPerLine, offset);
        } else {
          offset = writeDataBytes(data, newData, slotsPerLine, offset);
        }
      }
    } else if (this._interlaceMethod === InterlaceMethod.ADAM7) {
      offset = writeDataInterlaced(this._png, data, newData, offset);
    }
    const buffer = newData.toArray();
    const compressed = zlibSync(buffer, this._zlibOptions);
    this.encodeIDAT(compressed);
  }
  _checkData(data) {
    const { colorType, channels, depth } = getColorType(data, data.palette);
    const png = {
      width: checkInteger(data.width, "width"),
      height: checkInteger(data.height, "height"),
      channels,
      data: data.data,
      depth,
      text: data.text,
      palette: data.palette
    };
    this._colorType = colorType;
    const expectedSize = depth < 8 ? Math.ceil(png.width * depth / 8) * png.height * channels : png.width * png.height * channels;
    if (png.data.length !== expectedSize) {
      throw new RangeError(`wrong data size. Found ${png.data.length}, expected ${expectedSize}`);
    }
    return png;
  }
};
function checkInteger(value, name) {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }
  throw new TypeError(`${name} must be a positive integer`);
}
function getColorType(data, palette) {
  const { channels = 4, depth = 8 } = data;
  if (channels !== 4 && channels !== 3 && channels !== 2 && channels !== 1) {
    throw new RangeError(`unsupported number of channels: ${channels}`);
  }
  const returnValue = {
    channels,
    depth,
    colorType: ColorType.UNKNOWN
  };
  switch (channels) {
    case 4:
      returnValue.colorType = ColorType.TRUECOLOUR_ALPHA;
      break;
    case 3:
      returnValue.colorType = ColorType.TRUECOLOUR;
      break;
    case 1:
      if (palette) {
        returnValue.colorType = ColorType.INDEXED_COLOUR;
      } else {
        returnValue.colorType = ColorType.GREYSCALE;
      }
      break;
    case 2:
      returnValue.colorType = ColorType.GREYSCALE_ALPHA;
      break;
    default:
      throw new Error("unsupported number of channels");
  }
  return returnValue;
}
function writeDataBytes(data, newData, slotsPerLine, offset) {
  for (let j = 0; j < slotsPerLine; j++) {
    newData.writeByte(data[offset++]);
  }
  return offset;
}
function writeDataInterlaced(imageData, data, newData, offset) {
  const passes = [
    { x: 0, y: 0, xStep: 8, yStep: 8 },
    { x: 4, y: 0, xStep: 8, yStep: 8 },
    { x: 0, y: 4, xStep: 4, yStep: 8 },
    { x: 2, y: 0, xStep: 4, yStep: 4 },
    { x: 0, y: 2, xStep: 2, yStep: 4 },
    { x: 1, y: 0, xStep: 2, yStep: 2 },
    { x: 0, y: 1, xStep: 1, yStep: 2 }
  ];
  const { width, height, channels, depth } = imageData;
  let pixelSize;
  if (depth === 16) {
    pixelSize = channels * depth / 8 / 2;
  } else {
    pixelSize = channels * depth / 8;
  }
  for (let passIndex = 0; passIndex < 7; passIndex++) {
    const pass = passes[passIndex];
    const passWidth = Math.floor((width - pass.x + pass.xStep - 1) / pass.xStep);
    const passHeight = Math.floor((height - pass.y + pass.yStep - 1) / pass.yStep);
    if (passWidth <= 0 || passHeight <= 0)
      continue;
    const passLineBytes = passWidth * pixelSize;
    for (let y = 0; y < passHeight; y++) {
      const imageY = pass.y + y * pass.yStep;
      const rawScanline = depth <= 8 ? new Uint8Array(passLineBytes) : new Uint16Array(passLineBytes);
      let rawOffset = 0;
      for (let x2 = 0; x2 < passWidth; x2++) {
        const imageX = pass.x + x2 * pass.xStep;
        if (imageX < width && imageY < height) {
          const srcPos = (imageY * width + imageX) * pixelSize;
          for (let i2 = 0; i2 < pixelSize; i2++) {
            rawScanline[rawOffset++] = data[srcPos + i2];
          }
        }
      }
      newData.writeByte(0);
      if (depth === 8) {
        newData.writeBytes(rawScanline);
      } else if (depth === 16) {
        for (const value of rawScanline) {
          newData.writeByte(value >> 8 & 255);
          newData.writeByte(value & 255);
        }
      }
    }
  }
  return offset;
}
function writeDataUint16(data, newData, slotsPerLine, offset) {
  for (let j = 0; j < slotsPerLine; j++) {
    newData.writeUint16(data[offset++]);
  }
  return offset;
}

// ../ThreeSprite/node_modules/.pnpm/fast-png@8.0.0/node_modules/fast-png/lib/index.js
function decodePng(data, options) {
  const decoder = new PngDecoder(data, options);
  return decoder.decode();
}
function encodePng(png, options) {
  const encoder2 = new PngEncoder(png, options);
  return encoder2.encode();
}

// ../ThreeSprite/src/domain/image.ts
function createImage(width, height, fill) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  if (fill && fill[3] > 0) {
    for (let i2 = 0; i2 < pixels.length; i2 += 4) {
      pixels[i2] = fill[0];
      pixels[i2 + 1] = fill[1];
      pixels[i2 + 2] = fill[2];
      pixels[i2 + 3] = fill[3];
    }
  }
  return { width, height, pixels };
}
function flipXPixelsInPlace(px, w, h) {
  const half = w >> 1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x2 = 0; x2 < half; x2++) {
      const s = row + x2 * 4;
      const d = row + (w - 1 - x2) * 4;
      for (let k = 0; k < 4; k++) {
        const t = px[s + k];
        px[s + k] = px[d + k];
        px[d + k] = t;
      }
    }
  }
}
function opaqueBounds(px, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x2 = 0; x2 < w; x2++) {
      if (px[(y * w + x2) * 4 + 3] !== 0) {
        if (x2 < x0) x0 = x2;
        if (x2 > x1) x1 = x2;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ../ThreeSprite/src/domain/types.ts
var FORMAT_VERSION = 3;
var MIN_CANVAS = 8;
var MAX_CANVAS = 256;
var MAX_FRAMES = 256;
var SPRITE_NAME_RE = /^[A-Z0-9]{4}$/;
var ZERO3 = Object.freeze({ r: 0, u: 0, f: 0 });
var ONE3 = Object.freeze({ r: 1, u: 1, f: 1 });

// ../ThreeSprite/src/core/export/plan.ts
function slug(name) {
  const s = name.replace(/[^A-Za-z0-9_-]/g, "_");
  return s || "anim";
}

// ../ThreeSprite/src/core/export/atlasBuild.ts
function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
function pack(sizes, padding, pow2Height) {
  if (sizes.length === 0) return { pos: [], width: 1, height: 1 };
  let area = 0;
  let maxW = 1;
  for (const [w, h] of sizes) {
    area += (w + padding) * (h + padding);
    maxW = Math.max(maxW, w + padding);
  }
  const width = Math.max(nextPow2(Math.max(Math.ceil(Math.sqrt(area * 1.15)), maxW)), 1);
  const order = sizes.map((_, i2) => i2);
  order.sort((a, b) => sizes[b][1] - sizes[a][1] || sizes[b][0] - sizes[a][0] || a - b);
  const pos = sizes.map(() => [0, 0]);
  let x2 = padding;
  let y = padding;
  let shelfH = 0;
  for (const i2 of order) {
    const [w, h] = sizes[i2];
    if (x2 + w + padding > width) {
      x2 = padding;
      y += shelfH + padding;
      shelfH = 0;
    }
    pos[i2] = [x2, y];
    x2 += w + padding;
    shelfH = Math.max(shelfH, h);
  }
  let height = y + shelfH + padding;
  if (pow2Height) height = nextPow2(height);
  return { pos, width, height: Math.max(height, 1) };
}
function buildAtlas(input) {
  const n = input.canvas;
  const padding = 1;
  const warnings = [];
  const trims = input.buffers.map((buf, i2) => {
    const b = opaqueBounds(buf, n, n);
    if (b) return b;
    const fr = input.frames[i2];
    warnings.push(`${input.animations[fr.anim].name}: frame ${fr.frame + 1} view ${fr.view} is empty`);
    return { x: 0, y: 0, w: 1, h: 1 };
  });
  const { pos, width, height } = pack(trims.map((t) => [t.w, t.h]), padding, input.pow2);
  const sheet = new Uint8ClampedArray(width * height * 4);
  input.buffers.forEach((buf, i2) => {
    if (!opaqueBounds(buf, n, n)) return;
    const t = trims[i2];
    const [px, py] = pos[i2];
    for (let y = 0; y < t.h; y++) {
      const src = ((t.y + y) * n + t.x) * 4;
      const dst = ((py + y) * width + px) * 4;
      sheet.set(buf.subarray(src, src + t.w * 4), dst);
    }
  });
  const png = encodePng({ width, height, data: new Uint8Array(sheet.buffer, sheet.byteOffset, sheet.length), channels: 4 });
  const nviews = input.views.count;
  const authored = input.views.mirror ? Math.floor(nviews / 2) + 1 : nviews;
  const views = [];
  for (let k = 1; k <= nviews; k++) {
    const derived = input.views.mirror && k > authored;
    views.push({
      index: k,
      angleDeg: (k - 1) * 360 / nviews,
      mirrored: derived,
      mirrorOf: derived ? (nviews - (k - 1)) % nviews + 1 : null
    });
  }
  const frames = {};
  const animFrames = input.animations.map((a) => Array.from({ length: a.frameCount }, () => ({})));
  input.frames.forEach((fr, i2) => {
    const key = `${slug(input.animations[fr.anim].name)}/${fr.frame}/v${fr.view}`;
    const t = trims[i2];
    const [px, py] = pos[i2];
    const feetX = n / 2;
    const feetY = n;
    frames[key] = {
      rect: { x: px, y: py, w: t.w, h: t.h },
      source: t,
      pivot: { x: (feetX - t.x) / t.w, y: (feetY - t.y) / t.h }
    };
    const row = animFrames[fr.anim]?.[fr.frame];
    if (row) row[String(fr.view)] = key;
  });
  const manifest = {
    format: "threesprite-atlas",
    version: 1,
    sprite: input.sprite,
    canvas: { w: n, h: n },
    worldHeight: input.worldHeight,
    image: `${input.sprite}.png`,
    size: { w: width, h: height },
    conventions: "angleDeg = camera bearing relative to the character's facing, anticlockwise seen from above; 0 = character faces the camera. pivot is the feet point (bottom centre of the canvas) relative to each trimmed rect, normalised to its size.",
    views: { count: nviews, mirror: input.views.mirror, list: views },
    frames,
    animations: input.animations.map((a, ai) => ({
      name: a.name,
      fps: a.fps,
      loop: a.loop,
      frames: animFrames[ai].map((views2, fi) => ({ index: fi, views: views2 }))
    }))
  };
  return { png, rgba: sheet, json: JSON.stringify(manifest, null, 2), manifest, width, height, warnings };
}

// ../ThreeSprite/src/domain/animation.ts
var lerpNumber = (a, b, u) => a + (b - a) * u;
var lerpVec3 = (a, b, u) => ({ r: lerpNumber(a.r, b.r, u), u: lerpNumber(a.u, b.u, u), f: lerpNumber(a.f, b.f, u) });
var stepOnly = (a) => a;
var smoothstep = (u) => u * u * (3 - 2 * u);
function sampleTrack(keys, frame, identity, lerp) {
  const n = keys.length;
  if (n === 0) return identity;
  if (frame <= keys[0].frame) return keys[0].value;
  if (frame >= keys[n - 1].frame) return keys[n - 1].value;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = lo + hi + 1 >> 1;
    if (keys[mid].frame <= frame) lo = mid;
    else hi = mid - 1;
  }
  const k0 = keys[lo];
  const k1 = keys[lo + 1];
  if (k0.interp === "step") return k0.value;
  const span = k1.frame - k0.frame;
  let u = span > 0 ? (frame - k0.frame) / span : 1;
  if (k0.interp === "easeInOut") u = smoothstep(u);
  return lerp(k0.value, k1.value, u);
}

// ../ThreeSprite/src/domain/math3.ts
var IDENTITY3 = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);
var D2R = Math.PI / 180;
var add3 = (a, b) => ({ r: a.r + b.r, u: a.u + b.u, f: a.f + b.f });
var sub3 = (a, b) => ({ r: a.r - b.r, u: a.u - b.u, f: a.f - b.f });
var scale3 = (a, k) => ({ r: a.r * k, u: a.u * k, f: a.f * k });
var dot3 = (a, b) => a.r * b.r + a.u * b.u + a.f * b.f;
var length3 = (a) => Math.hypot(a.r, a.u, a.f);
var cross3 = (a, b) => ({ r: a.u * b.f - a.f * b.u, u: a.f * b.r - a.r * b.f, f: a.r * b.u - a.u * b.r });
function normalize3(a) {
  const l = length3(a) || 1;
  return { r: a.r / l, u: a.u / l, f: a.f / l };
}
function mul3(a, b) {
  const o = new Array(9);
  for (let i2 = 0; i2 < 3; i2++) for (let j = 0; j < 3; j++) o[i2 * 3 + j] = a[i2 * 3] * b[j] + a[i2 * 3 + 1] * b[3 + j] + a[i2 * 3 + 2] * b[6 + j];
  return o;
}
function apply3(m, v) {
  return { r: m[0] * v.r + m[1] * v.u + m[2] * v.f, u: m[3] * v.r + m[4] * v.u + m[5] * v.f, f: m[6] * v.r + m[7] * v.u + m[8] * v.f };
}
function scaleMatrix(s) {
  return [s.r, 0, 0, 0, s.u, 0, 0, 0, s.f];
}
function eulerMatrix(rot) {
  const cy = Math.cos(-rot.u * D2R), sy = Math.sin(-rot.u * D2R);
  const cp = Math.cos(-rot.r * D2R), sp = Math.sin(-rot.r * D2R);
  const cr = Math.cos(-rot.f * D2R), sr = Math.sin(-rot.f * D2R);
  const ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  const rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  return mul3(mul3(ry, rx), rz);
}
var affine = (m, t) => ({ m, t });
var IDENTITY34 = Object.freeze({ m: IDENTITY3, t: { r: 0, u: 0, f: 0 } });
function composeAffine(a, b) {
  return { m: mul3(a.m, b.m), t: add3(apply3(a.m, b.t), a.t) };
}
function applyAffine(a, v) {
  return add3(apply3(a.m, v), a.t);
}
function rotationOf3(a) {
  const x2 = normalize3({ r: a.m[0], u: a.m[3], f: a.m[6] });
  let y = { r: a.m[1], u: a.m[4], f: a.m[7] };
  y = normalize3(sub3(y, scale3(x2, dot3(x2, y))));
  const z = cross3(x2, y);
  return [x2.r, y.r, z.r, x2.u, y.u, z.u, x2.f, y.f, z.f];
}
function trig(vp) {
  const rel = (vp.view - 1) / vp.N;
  return { c: Math.cos(2 * Math.PI * rel), s: Math.sin(2 * Math.PI * rel), cp: Math.cos(vp.elevationDeg * D2R), sp: Math.sin(vp.elevationDeg * D2R) };
}
function projectPoint(p, vp) {
  const { c, s, cp, sp } = trig(vp);
  const sx = -p.f * s - p.r * c;
  const sy = p.u;
  const d = p.f * c - p.r * s;
  return { x: vp.size / 2 + sx, y: vp.size - (sy * cp - d * sp), depth: sy * sp + d * cp };
}
function viewAxes(vp) {
  const { c, s, cp, sp } = trig(vp);
  return {
    right: { r: -c, u: 0, f: -s },
    up: { r: s * sp, u: cp, f: -c * sp },
    toward: { r: -s * cp, u: sp, f: c * cp }
  };
}
function projectedAngle(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return { angle: -Math.atan2(dy, dx) * 180 / Math.PI, length: Math.hypot(dx, dy) };
}

// ../ThreeSprite/src/domain/transform.ts
var IDENTITY = Object.freeze({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
function translate(x2, y) {
  return { a: 1, b: 0, c: 0, d: 1, tx: x2, ty: y };
}
function rotate(deg) {
  const r = deg * Math.PI / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { a: cos, b: -sin, c: sin, d: cos, tx: 0, ty: 0 };
}
function scale(sx, sy) {
  return { a: sx, b: 0, c: 0, d: sy, tx: 0, ty: 0 };
}
function mul(p, q) {
  return {
    a: p.a * q.a + p.c * q.b,
    b: p.b * q.a + p.d * q.b,
    c: p.a * q.c + p.c * q.d,
    d: p.b * q.c + p.d * q.d,
    tx: p.a * q.tx + p.c * q.ty + p.tx,
    ty: p.b * q.tx + p.d * q.ty + p.ty
  };
}
function compose(...ms) {
  let m = { ...IDENTITY };
  for (const n of ms) m = mul(m, n);
  return m;
}
function invert(m) {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const ia = m.d / det;
  const ib = -m.b / det;
  const ic = -m.c / det;
  const id = m.a / det;
  return {
    a: ia,
    b: ib,
    c: ic,
    d: id,
    tx: -(ia * m.tx + ic * m.ty),
    ty: -(ib * m.tx + id * m.ty)
  };
}
function apply(m, x2, y) {
  return { x: m.a * x2 + m.c * y + m.tx, y: m.b * x2 + m.d * y + m.ty };
}

// ../ThreeSprite/src/domain/pose.ts
function sampleBone(anim, boneId, frame) {
  const t = anim?.boneTracks[boneId];
  if (!t) return { rotation: ZERO3, translate: ZERO3, scale: ONE3 };
  return {
    rotation: sampleTrack(t.rotation, frame, ZERO3, lerpVec3),
    translate: sampleTrack(t.translate, frame, ZERO3, lerpVec3),
    scale: sampleTrack(t.scale, frame, ONE3, lerpVec3)
  };
}
function samplePart(anim, part, frame) {
  const t = anim?.partTracks[part.id];
  if (!t) return { visible: true, variantId: part.defaultVariant };
  return {
    visible: sampleTrack(t.visible, frame, true, stepOnly),
    variantId: sampleTrack(t.variant, frame, part.defaultVariant, stepOnly)
  };
}
function boneLocal(bone, s) {
  const rot = add3(bone.rest.rotation, s.rotation);
  return affine(mul3(eulerMatrix(rot), scaleMatrix(s.scale)), add3(bone.rest.position, s.translate));
}
function evalPose(skel, anim, frame) {
  const world = /* @__PURE__ */ new Map();
  const visit = (id, parent) => {
    const bone = skel.bones[id];
    if (!bone) return;
    const local = boneLocal(bone, sampleBone(anim, id, frame));
    const m = parent ? composeAffine(parent, local) : local;
    world.set(id, m);
    for (const c of bone.children) visit(c, m);
  };
  for (const root of skel.rootOrder) visit(root, null);
  return world;
}
var MIN_PROJECTED = 0.5;
function projectBone(world, length, vp, fallbackAngle = 90) {
  const o = projectPoint(applyAffine(world, ZERO3), vp);
  const t = projectPoint(applyAffine(world, { r: 0, u: length, f: 0 }), vp);
  const pa = projectedAngle(o, t);
  const angle = pa.length < MIN_PROJECTED ? fallbackAngle : pa.angle;
  return { origin: { x: o.x, y: o.y }, tip: { x: t.x, y: t.y }, angle, length: pa.length, depth: o.depth };
}
function partMatrix(rest, cur, part) {
  let fs = 1;
  if (part.foreshorten && rest.length >= MIN_PROJECTED) fs = Math.max(0.15, Math.min(4, cur.length / rest.length));
  const angle = cur.length < MIN_PROJECTED ? rest.angle : cur.angle;
  return compose(translate(cur.origin.x, cur.origin.y), rotate(angle), scale(fs, 1), translate(part.offset.x, part.offset.y), rotate(part.rotation), translate(-part.pivot.x, -part.pivot.y));
}
function viewProj(p, view) {
  return { N: p.views.count, view, size: p.canvas.size, elevationDeg: p.views.elevationDeg };
}

// ../ThreeSprite/src/domain/skin.ts
function boneFrame(bp, fs = 1) {
  return compose(translate(bp.origin.x, bp.origin.y), rotate(bp.angle), scale(fs, 1));
}
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function influence(d, falloff) {
  const t = 1 - d / Math.max(1e-6, falloff);
  return t > 0 ? t * t : 0;
}
function buildSkinGrid(img, restMatrix, boneRests, falloff, cell) {
  const c = Math.max(1, Math.round(cell));
  const cols = Math.max(1, Math.ceil(img.width / c));
  const rows = Math.max(1, Math.ceil(img.height / c));
  const nv = (cols + 1) * (rows + 1);
  const nb = boneRests.length;
  const uv = new Float32Array(nv * 2);
  const rest = new Float32Array(nv * 2);
  const weights = new Float32Array(nv * nb);
  let k = 0;
  for (let j = 0; j <= rows; j++) {
    for (let i2 = 0; i2 <= cols; i2++, k++) {
      const u = Math.min(img.width, i2 * c);
      const v = Math.min(img.height, j * c);
      uv[k * 2] = u;
      uv[k * 2 + 1] = v;
      const p = apply(restMatrix, u, v);
      rest[k * 2] = p.x;
      rest[k * 2 + 1] = p.y;
      let sum = 0;
      let nearest = 0;
      let nearestD = Infinity;
      for (let b = 0; b < nb; b++) {
        const br = boneRests[b];
        const d = distToSegment(p.x, p.y, br.origin.x, br.origin.y, br.tip.x, br.tip.y);
        const w = influence(d, falloff);
        weights[k * nb + b] = w;
        sum += w;
        if (d < nearestD) {
          nearestD = d;
          nearest = b;
        }
      }
      if (sum <= 0) {
        weights[k * nb + nearest] = 1;
      } else {
        for (let b = 0; b < nb; b++) weights[k * nb + b] /= sum;
      }
    }
  }
  return { cols, rows, uv, rest, weights };
}
function deformGrid(grid, boneRests, boneCurs, foreshorten) {
  const nb = boneRests.length;
  const deltas = [];
  for (let b = 0; b < nb; b++) {
    const r = boneRests[b];
    const cu = boneCurs[b];
    const fs = foreshorten && r.length >= 0.5 ? Math.max(0.15, Math.min(4, cu.length / r.length)) : 1;
    const angle = cu.length < 0.5 ? r.angle : cu.angle;
    const curFrame = compose(translate(cu.origin.x, cu.origin.y), rotate(angle), scale(fs, 1));
    const inv = invert(boneFrame(r, 1));
    deltas.push(inv ? compose(curFrame, inv) : { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
  }
  const nv = grid.rest.length / 2;
  const out = new Float32Array(nv * 2);
  for (let k = 0; k < nv; k++) {
    const x2 = grid.rest[k * 2], y = grid.rest[k * 2 + 1];
    let ox = 0, oy = 0;
    for (let b = 0; b < nb; b++) {
      const w = grid.weights[k * nb + b];
      if (w === 0) continue;
      const m = deltas[b];
      ox += w * (m.a * x2 + m.c * y + m.tx);
      oy += w * (m.b * x2 + m.d * y + m.ty);
    }
    out[k * 2] = ox;
    out[k * 2 + 1] = oy;
  }
  return out;
}
function gridIsAtRest(grid, pos, eps = 1e-6) {
  for (let i2 = 0; i2 < pos.length; i2++) if (Math.abs(pos[i2] - grid.rest[i2]) > eps) return false;
  return true;
}
function rasterizeSkinnedGrid(dst, dw, dh, img, grid, pos, alphaMul = 1) {
  const covered = new Uint8Array(dw * dh);
  const stride = grid.cols + 1;
  for (let j = 0; j < grid.rows; j++) {
    for (let i2 = 0; i2 < grid.cols; i2++) {
      const a = j * stride + i2, b = a + 1, c = a + stride, d = c + 1;
      tri(a, b, d);
      tri(a, d, c);
    }
  }
  function tri(i0, i1, i2) {
    const x0 = pos[i0 * 2], y0 = pos[i0 * 2 + 1], u0 = grid.uv[i0 * 2], v0 = grid.uv[i0 * 2 + 1];
    const x1 = pos[i1 * 2], y1 = pos[i1 * 2 + 1], u1 = grid.uv[i1 * 2], v1 = grid.uv[i1 * 2 + 1];
    const x2 = pos[i2 * 2], y2 = pos[i2 * 2 + 1], u2 = grid.uv[i2 * 2], v2 = grid.uv[i2 * 2 + 1];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) return;
    const inv = 1 / area;
    const bx0 = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const bx1 = Math.min(dw - 1, Math.ceil(Math.max(x0, x1, x2)));
    const by0 = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const by1 = Math.min(dh - 1, Math.ceil(Math.max(y0, y1, y2)));
    const sw = img.width, sh = img.height, sp = img.pixels;
    for (let y = by0; y <= by1; y++) {
      const py = y + 0.5;
      for (let x3 = bx0; x3 <= bx1; x3++) {
        const idx = y * dw + x3;
        if (covered[idx]) continue;
        const px = x3 + 0.5;
        let w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv;
        let w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv;
        let w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        w0 = Math.max(0, w0);
        w1 = Math.max(0, w1);
        w2 = Math.max(0, w2);
        const u = u0 * w0 + u1 * w1 + u2 * w2;
        const v = v0 * w0 + v1 * w1 + v2 * w2;
        const si = Math.min(sw - 1, Math.max(0, Math.floor(u)));
        const sj = Math.min(sh - 1, Math.max(0, Math.floor(v)));
        const s = (sj * sw + si) * 4;
        let sa = sp[s + 3];
        if (sa === 0) continue;
        covered[idx] = 1;
        if (alphaMul !== 1) sa *= alphaMul;
        const o = idx * 4;
        if (sa >= 255) {
          dst[o] = sp[s];
          dst[o + 1] = sp[s + 1];
          dst[o + 2] = sp[s + 2];
          dst[o + 3] = 255;
          continue;
        }
        const a = sa / 255;
        const da = dst[o + 3] / 255;
        const outA = a + da * (1 - a);
        if (outA <= 0) continue;
        const wS = a / outA, wD = da * (1 - a) / outA;
        dst[o] = sp[s] * wS + dst[o] * wD;
        dst[o + 1] = sp[s + 1] * wS + dst[o + 1] * wD;
        dst[o + 2] = sp[s + 2] * wS + dst[o + 2] * wD;
        dst[o + 3] = outA * 255;
      }
    }
  }
}

// ../ThreeSprite/src/domain/ids.ts
var ALPHABET = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
if (ALPHABET.length !== 64) throw new Error("id alphabet must have 64 symbols");
function newId(size = 12) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let id = "";
  for (let i2 = 0; i2 < size; i2++) id += ALPHABET[bytes[i2] & 63];
  return id;
}

// ../ThreeSprite/src/domain/solids.ts
var meshCache = /* @__PURE__ */ new Map();
function unitMesh(kind) {
  let m = meshCache.get(kind);
  if (!m) {
    m = buildMesh(kind);
    meshCache.set(kind, m);
  }
  return m;
}
function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function faceNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return norm([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
}
function flatTri(b, a, c, d, n) {
  const nn = n ?? faceNormal(a, c, d);
  smoothTri(b, a, c, d, nn, nn, nn);
}
function smoothTri(b, a, c, d, na, nc, nd) {
  const base = b.pos.length / 3;
  for (const [p, n] of [[a, na], [c, nc], [d, nd]]) {
    b.pos.push(p[0], p[1], p[2]);
    b.nor.push(n[0], n[1], n[2]);
  }
  b.idx.push(base, base + 1, base + 2);
}
function buildMesh(kind) {
  const b = { pos: [], nor: [], idx: [] };
  const h = 0.5;
  switch (kind) {
    case "cube": {
      const faces = [
        [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]],
        // +z (front)
        [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]],
        // −z
        [[h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h]],
        // +x
        [[-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h]],
        // −x
        [[-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h]],
        // +y (top)
        [[-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h]]
        // −y
      ];
      for (const [a, c, d, e] of faces) {
        flatTri(b, a, c, d);
        flatTri(b, a, d, e);
      }
      break;
    }
    case "pyramid": {
      const apex = [0, h, 0];
      const base = [[-h, -h, h], [h, -h, h], [h, -h, -h], [-h, -h, -h]];
      for (let i2 = 0; i2 < 4; i2++) flatTri(b, base[i2], base[(i2 + 1) % 4], apex);
      flatTri(b, base[0], base[3], base[2]);
      flatTri(b, base[0], base[2], base[1]);
      break;
    }
    case "sphere": {
      const lat = 12, lon = 20;
      const v = (i2, j) => {
        const th = i2 / lat * Math.PI, ph = j / lon * Math.PI * 2;
        return [Math.sin(th) * Math.cos(ph) * h, Math.cos(th) * h, Math.sin(th) * Math.sin(ph) * h];
      };
      for (let i2 = 0; i2 < lat; i2++) {
        for (let j = 0; j < lon; j++) {
          const a = v(i2, j), c = v(i2 + 1, j), d = v(i2 + 1, j + 1), e = v(i2, j + 1);
          if (i2 > 0) smoothTri(b, a, c, d, norm(a), norm(c), norm(d));
          if (i2 < lat - 1) smoothTri(b, a, d, e, norm(a), norm(d), norm(e));
        }
      }
      break;
    }
    case "cylinder":
    case "cone": {
      const seg = 24;
      const top = kind === "cone" ? 0 : h;
      const tilt = kind === "cone" ? 0.5 : 0;
      for (let j = 0; j < seg; j++) {
        const a0 = j / seg * Math.PI * 2, a1 = (j + 1) / seg * Math.PI * 2;
        const p0 = [Math.cos(a0) * h, -h, Math.sin(a0) * h], p1 = [Math.cos(a1) * h, -h, Math.sin(a1) * h];
        const q0 = [Math.cos(a0) * top, h, Math.sin(a0) * top], q1 = [Math.cos(a1) * top, h, Math.sin(a1) * top];
        const n0 = norm([Math.cos(a0), tilt, Math.sin(a0)]), n1 = norm([Math.cos(a1), tilt, Math.sin(a1)]);
        if (kind === "cone") {
          smoothTri(b, p0, [0, h, 0], p1, n0, norm([Math.cos((a0 + a1) / 2), tilt, Math.sin((a0 + a1) / 2)]), n1);
        } else {
          smoothTri(b, p0, q0, p1, n0, n0, n1);
          smoothTri(b, p1, q0, q1, n1, n0, n1);
        }
        flatTri(b, [0, -h, 0], p1, p0, [0, -1, 0]);
        if (kind === "cylinder") flatTri(b, [0, h, 0], q0, q1, [0, 1, 0]);
      }
      break;
    }
  }
  return { positions: Float32Array.from(b.pos), normals: Float32Array.from(b.nor), indices: Uint16Array.from(b.idx) };
}
function tones(color, levels) {
  const out = [];
  for (let i2 = 0; i2 < levels; i2++) {
    const t = levels === 1 ? 1 : i2 / (levels - 1);
    const k = 0.45 + t * 0.55;
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    out.push([c(color[0]), c(color[1]), c(color[2]), 255]);
  }
  return out;
}
function outlineColor(color) {
  return [Math.round(color[0] * 0.25), Math.round(color[1] * 0.25), Math.round(color[2] * 0.25), 255];
}
function renderSolids(group, world, vp) {
  const size = vp.size;
  const img = createImage(size, size);
  const zbuf = new Float32Array(size * size).fill(-Infinity);
  const primOf = new Int16Array(size * size).fill(-1);
  const shade = new Float32Array(size * size);
  const axes = viewAxes(vp);
  const worldRot = rotationOf3(world);
  let L = [-0.45, 0.75, 0.55];
  if (group.shading.lightSpace === "character") {
    const lc2 = { r: 0.45, u: 0.75, f: 0.55 };
    L = [dot3(lc2, axes.right), dot3(lc2, axes.up), dot3(lc2, axes.toward)];
  }
  const ll = Math.hypot(L[0], L[1], L[2]) || 1;
  L = [L[0] / ll, L[1] / ll, L[2] / ll];
  const prims = group.order.map((id) => group.primitives[id]).filter((p) => !!p && p.visible);
  prims.forEach((prim, pi) => {
    const mesh = unitMesh(prim.kind);
    const R = eulerMatrix(prim.rotation);
    const NR = mul3(worldRot, R);
    const n = mesh.positions.length / 3;
    const vx = new Float32Array(n), vy = new Float32Array(n), vz = new Float32Array(n);
    const nx = new Float32Array(n), ny = new Float32Array(n), nz = new Float32Array(n);
    for (let i2 = 0; i2 < n; i2++) {
      const local = apply3(R, { r: mesh.positions[i2 * 3] * prim.size.r, u: mesh.positions[i2 * 3 + 1] * prim.size.u, f: mesh.positions[i2 * 3 + 2] * prim.size.f });
      const p = applyAffine(world, { r: local.r + prim.position.r, u: local.u + prim.position.u, f: local.f + prim.position.f });
      const pr = projectPoint(p, vp);
      vx[i2] = pr.x;
      vy[i2] = pr.y;
      vz[i2] = pr.depth;
      const wn = normalize3(apply3(NR, { r: mesh.normals[i2 * 3], u: mesh.normals[i2 * 3 + 1], f: mesh.normals[i2 * 3 + 2] }));
      nx[i2] = dot3(wn, axes.right);
      ny[i2] = dot3(wn, axes.up);
      nz[i2] = dot3(wn, axes.toward);
    }
    const idx = mesh.indices;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], q = idx[t + 2];
      const area = (vx[b] - vx[a]) * (vy[q] - vy[a]) - (vx[q] - vx[a]) * (vy[b] - vy[a]);
      if (area <= 0) continue;
      const inv = 1 / area;
      const x0 = Math.max(0, Math.floor(Math.min(vx[a], vx[b], vx[q])));
      const x1 = Math.min(size - 1, Math.ceil(Math.max(vx[a], vx[b], vx[q])));
      const y0 = Math.max(0, Math.floor(Math.min(vy[a], vy[b], vy[q])));
      const y1 = Math.min(size - 1, Math.ceil(Math.max(vy[a], vy[b], vy[q])));
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5;
        for (let x2 = x0; x2 <= x1; x2++) {
          const px2 = x2 + 0.5;
          let w0 = ((vx[b] - px2) * (vy[q] - py) - (vx[q] - px2) * (vy[b] - py)) * inv;
          let w1 = ((vx[q] - px2) * (vy[a] - py) - (vx[a] - px2) * (vy[q] - py)) * inv;
          let w2 = 1 - w0 - w1;
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          w0 = Math.max(0, w0);
          w1 = Math.max(0, w1);
          w2 = Math.max(0, w2);
          const z = vz[a] * w0 + vz[b] * w1 + vz[q] * w2;
          const i2 = y * size + x2;
          if (z <= zbuf[i2]) continue;
          zbuf[i2] = z;
          primOf[i2] = pi;
          const lx = nx[a] * w0 + nx[b] * w1 + nx[q] * w2;
          const ly = ny[a] * w0 + ny[b] * w1 + ny[q] * w2;
          const lz = nz[a] * w0 + nz[b] * w1 + nz[q] * w2;
          const len = Math.hypot(lx, ly, lz) || 1;
          shade[i2] = Math.max(0, (lx * L[0] + ly * L[1] + lz * L[2]) / len);
        }
      }
    }
  });
  const levels = Math.max(2, Math.min(6, Math.round(group.shading.levels)));
  const toneTables = prims.map((p) => tones(p.color, levels));
  const px = img.pixels;
  for (let i2 = 0; i2 < size * size; i2++) {
    const pi = primOf[i2];
    if (pi < 0) continue;
    const tone = Math.min(levels - 1, Math.floor(shade[i2] * levels));
    const col = toneTables[pi][tone];
    px[i2 * 4] = col[0];
    px[i2 * 4 + 1] = col[1];
    px[i2 * 4 + 2] = col[2];
    px[i2 * 4 + 3] = 255;
  }
  if (group.shading.outline && prims.length) {
    const mark = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x2 = 0; x2 < size; x2++) {
        const i2 = y * size + x2;
        const pi = primOf[i2];
        if (pi < 0) continue;
        const z = zbuf[i2];
        const nb = [x2 > 0 ? i2 - 1 : -1, x2 < size - 1 ? i2 + 1 : -1, y > 0 ? i2 - size : -1, y < size - 1 ? i2 + size : -1];
        for (const j of nb) {
          if (j < 0) continue;
          if (primOf[j] < 0 || primOf[j] !== pi && zbuf[j] < z - 1.5) {
            mark[i2] = 1;
            break;
          }
        }
      }
    }
    for (let i2 = 0; i2 < size * size; i2++) {
      if (!mark[i2]) continue;
      const col = outlineColor(prims[primOf[i2]].color);
      px[i2 * 4] = col[0];
      px[i2 * 4 + 1] = col[1];
      px[i2 * 4 + 2] = col[2];
      px[i2 * 4 + 3] = 255;
    }
  }
  return img;
}

// ../ThreeSprite/src/domain/views.ts
var MIN_VIEWS = 1;
var MAX_VIEWS = 64;
function clampViewCount(n) {
  if (!Number.isFinite(n)) return 8;
  return Math.min(MAX_VIEWS, Math.max(MIN_VIEWS, Math.round(n)));
}
function mirrorOf(N, k) {
  return (N - (k - 1)) % N + 1;
}
function authoredViewCount(N, mirror) {
  return mirror ? Math.floor(N / 2) + 1 : N;
}
function authoredViews(N, mirror) {
  const n = authoredViewCount(N, mirror);
  const out = [];
  for (let k = 1; k <= Math.min(n, N); k++) out.push(k);
  return out;
}
function isDerived(N, mirror, k) {
  return mirror && k > authoredViewCount(N, mirror);
}

// ../ThreeSprite/src/core/raster/rasterizer.ts
function imageKey(partId, variantId, view) {
  return `${partId}/${variantId}/${view}`;
}
var SNAP_EPS = 1e-6;
function snapMatrix(m) {
  const q = (v) => Math.abs(v) < SNAP_EPS ? 0 : Math.abs(v - 1) < SNAP_EPS ? 1 : Math.abs(v + 1) < SNAP_EPS ? -1 : v;
  const a = q(m.a), b = q(m.b), c = q(m.c), d = q(m.d);
  const axisAligned = (a === 0 || a === 1 || a === -1) && (b === 0 || b === 1 || b === -1) && (c === 0 || c === 1 || c === -1) && (d === 0 || d === 1 || d === -1);
  return {
    a: axisAligned ? a : m.a,
    b: axisAligned ? b : m.b,
    c: axisAligned ? c : m.c,
    d: axisAligned ? d : m.d,
    tx: Math.round(m.tx),
    ty: Math.round(m.ty)
  };
}
function blitNearest(dst, dw, dh, src, m, alphaMul = 1) {
  const sw = src.width;
  const sh = src.height;
  const sp = src.pixels;
  if (sw <= 0 || sh <= 0 || alphaMul <= 0) return;
  const cx = [m.tx, m.a * sw + m.tx, m.c * sh + m.tx, m.a * sw + m.c * sh + m.tx];
  const cy = [m.ty, m.b * sw + m.ty, m.d * sh + m.ty, m.b * sw + m.d * sh + m.ty];
  const x0 = Math.max(0, Math.floor(Math.min(cx[0], cx[1], cx[2], cx[3])));
  const x1 = Math.min(dw, Math.ceil(Math.max(cx[0], cx[1], cx[2], cx[3])));
  const y0 = Math.max(0, Math.floor(Math.min(cy[0], cy[1], cy[2], cy[3])));
  const y1 = Math.min(dh, Math.ceil(Math.max(cy[0], cy[1], cy[2], cy[3])));
  if (x0 >= x1 || y0 >= y1) return;
  const inv = invert(m);
  if (!inv) return;
  const ia = inv.a, ib = inv.b, ic = inv.c, id = inv.d, itx = inv.tx, ity = inv.ty;
  for (let dy = y0; dy < y1; dy++) {
    const py = dy + 0.5;
    const rowBase = dy * dw;
    for (let dx = x0; dx < x1; dx++) {
      const px = dx + 0.5;
      const sx = ia * px + ic * py + itx;
      const sy = ib * px + id * py + ity;
      const si = Math.floor(sx);
      const sj = Math.floor(sy);
      if (si < 0 || sj < 0 || si >= sw || sj >= sh) continue;
      const s = (sj * sw + si) * 4;
      let sa = sp[s + 3];
      if (sa === 0) continue;
      if (alphaMul !== 1) sa *= alphaMul;
      const d = (rowBase + dx) * 4;
      if (sa >= 255) {
        dst[d] = sp[s];
        dst[d + 1] = sp[s + 1];
        dst[d + 2] = sp[s + 2];
        dst[d + 3] = 255;
        continue;
      }
      const a = sa / 255;
      const da = dst[d + 3] / 255;
      const outA = a + da * (1 - a);
      if (outA <= 0) continue;
      const wS = a / outA;
      const wD = da * (1 - a) / outA;
      dst[d] = sp[s] * wS + dst[d] * wD;
      dst[d + 1] = sp[s + 1] * wS + dst[d + 1] * wD;
      dst[d + 2] = sp[s + 2] * wS + dst[d + 2] * wD;
      dst[d + 3] = outA * 255;
    }
  }
}
function composeFrame(project, animId, frame, view, opts = {}) {
  const size = project.canvas.size;
  const N = project.views.count;
  const out = opts.out ?? new Uint8ClampedArray(size * size * 4);
  if (opts.out) out.fill(0);
  const derived = isDerived(N, project.views.mirror, view);
  const srcView = derived ? mirrorOf(N, view) : view;
  const vp = viewProj(project, srcView);
  const anim = animId ? project.animations[animId] ?? null : null;
  const pose = evalPose(project.skeleton, anim, frame);
  const rest = anim ? evalPose(project.skeleton, null, 0) : pose;
  for (const partId of project.partOrder) {
    if (opts.only && !opts.only.has(partId)) continue;
    const part = project.parts[partId];
    if (!part) continue;
    const bone = project.skeleton.bones[part.boneId];
    const world = pose.get(part.boneId);
    const restWorld = rest.get(part.boneId);
    if (!bone || !world || !restWorld) continue;
    const s = samplePart(anim, part, frame);
    if (!s.visible) continue;
    const alpha = opts.dim && opts.dim.except !== partId ? opts.dim.alpha : 1;
    if (part.solids) {
      const img2 = renderSolids(part.solids, world, vp);
      blitNearest(out, size, size, img2, IDENTITY, alpha);
      continue;
    }
    const variantId = part.variants[s.variantId] ? s.variantId : part.defaultVariant;
    const key = imageKey(partId, variantId, srcView);
    const img = opts.overrides?.get(key) ?? part.variants[variantId]?.images[srcView];
    if (!img) continue;
    const rp = projectBone(restWorld, bone.length, vp);
    const cp = anim ? projectBone(world, bone.length, vp, rp.angle) : rp;
    const extra = part.skin ? part.skin.bones.filter((id) => id !== part.boneId && project.skeleton.bones[id] && pose.has(id) && rest.has(id)) : [];
    if (anim && extra.length) {
      const restProj = [rp];
      const curProj = [cp];
      for (const id of extra) {
        const b = project.skeleton.bones[id];
        const r = projectBone(rest.get(id), b.length, vp);
        restProj.push(r);
        curProj.push(projectBone(pose.get(id), b.length, vp, r.angle));
      }
      const restM = partMatrix(rp, rp, part);
      const grid = buildSkinGrid(img, restM, restProj, part.skin.falloff, part.skin.cell);
      const posArr = deformGrid(grid, restProj, curProj, part.foreshorten);
      if (!gridIsAtRest(grid, posArr)) {
        rasterizeSkinnedGrid(out, size, size, img, grid, posArr, alpha);
        continue;
      }
    }
    blitNearest(out, size, size, img, snapMatrix(partMatrix(rp, cp, part)), alpha);
  }
  if (derived) flipXPixelsInPlace(out, size, size);
  return out;
}

// ../ThreeSprite/src/core/io/exportBundle.ts
function collectFrames(project, animIds, onProgress) {
  const N = project.views.count;
  const anims = project.animationOrder.filter((id) => animIds.includes(id)).map((id) => project.animations[id]);
  const total = anims.reduce((a, x2) => a + x2.frameCount, 0) * N;
  const animations = anims.map((a) => ({ name: a.name, fps: a.fps, loop: a.loop, frameCount: a.frameCount }));
  const frames = [];
  const buffers = [];
  let done = 0;
  anims.forEach((anim, ai) => {
    for (let f = 0; f < anim.frameCount; f++) {
      for (let v = 1; v <= N; v++) {
        frames.push({ anim: ai, frame: f, view: v });
        buffers.push(composeFrame(project, anim.id, f, v));
        onProgress?.(++done, total);
      }
    }
  });
  return { animations, frames, buffers };
}

// ../ThreeSprite/src/domain/palette.ts
var MAX_PALETTE = 256;
var hex = (...list) => list.map((h) => {
  const v = parseInt(h, 16);
  return [v >> 16 & 255, v >> 8 & 255, v & 255, 255];
});
var grays = (n) => Array.from({ length: n }, (_, i2) => {
  const v = Math.round(i2 * 255 / (n - 1));
  return [v, v, v, 255];
});
var PRESET_PALETTES = [
  {
    name: "DawnBringer 16",
    colors: hex("140c1c", "442434", "30346d", "4e4a4e", "854c30", "346524", "d04648", "757161", "597dce", "d27d2c", "8595a1", "6daa2c", "d2aa99", "6dc2ca", "dad45e", "deeed6")
  },
  {
    name: "DawnBringer 32",
    colors: hex(
      "000000",
      "222034",
      "45283c",
      "663931",
      "8f563b",
      "df7126",
      "d9a066",
      "eec39a",
      "fbf236",
      "99e550",
      "6abe30",
      "37946e",
      "4b692f",
      "524b24",
      "323c39",
      "3f3f74",
      "306082",
      "5b6ee1",
      "639bff",
      "5fcde4",
      "cbdbfc",
      "ffffff",
      "9badb7",
      "847e87",
      "696a6a",
      "595652",
      "76428a",
      "ac3232",
      "d95763",
      "d77bba",
      "8f974a",
      "8a6f30"
    )
  },
  {
    name: "PICO-8",
    colors: hex("000000", "1d2b53", "7e2553", "008751", "ab5236", "5f574f", "c2c3c7", "fff1e8", "ff004d", "ffa300", "ffec27", "00e436", "29adff", "83769c", "ff77a8", "ffccaa")
  },
  {
    name: "Sweetie 16",
    colors: hex("1a1c2c", "5d275d", "b13e53", "ef7d57", "ffcd75", "a7f070", "38b764", "257179", "29366f", "3b5dc9", "41a6f6", "73eff7", "f4f4f4", "94b0c2", "566c86", "333c57")
  },
  {
    name: "Endesga 32",
    colors: hex(
      "be4a2f",
      "d77643",
      "ead4aa",
      "e4a672",
      "b86f50",
      "733e39",
      "3e2731",
      "a22633",
      "e43b44",
      "f77622",
      "feae34",
      "fee761",
      "63c74d",
      "3e8948",
      "265c42",
      "193c3e",
      "124e89",
      "0099db",
      "2ce8f5",
      "ffffff",
      "c0cbdc",
      "8b9bb4",
      "5a6988",
      "3a4466",
      "262b44",
      "181425",
      "ff0044",
      "68386c",
      "b55088",
      "f6757a",
      "e8b796",
      "c28569"
    )
  },
  {
    name: "Game Boy",
    colors: hex("0f380f", "306230", "8bac0f", "9bbc0f")
  },
  {
    name: "Greyscale 16",
    colors: grays(16)
  }
];
var DEFAULT_PALETTE = PRESET_PALETTES[0].colors;
function presetNameFor(colors) {
  for (const p of PRESET_PALETTES) {
    if (p.colors.length !== colors.length) continue;
    if (p.colors.every((c, i2) => sameColor(c, colors[i2]))) return p.name;
  }
  return null;
}
function sameColor(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}
function cloneColor(c) {
  return [c[0], c[1], c[2], c[3]];
}
function createPalette(name, colors) {
  return { id: newId(), name, colors: colors.slice(0, MAX_PALETTE).map(cloneColor) };
}
var EMPTY_PALETTE = Object.freeze({ id: "", name: "", colors: Object.freeze([]) });

// ../ThreeSprite/src/domain/project.ts
var isVec3 = (v) => !!v && typeof v === "object" && ["r", "u", "f"].every((k) => Number.isFinite(v[k]));
function validate(p) {
  const errs = [];
  if (p.formatVersion !== FORMAT_VERSION) errs.push(`unsupported formatVersion ${p.formatVersion}`);
  if (!SPRITE_NAME_RE.test(p.spriteName)) errs.push(`spriteName "${p.spriteName}" must be 4 chars [A-Z0-9]`);
  if (p.canvas.size < MIN_CANVAS || p.canvas.size > MAX_CANVAS) errs.push(`canvas size ${p.canvas.size} out of range`);
  if (p.views.count !== clampViewCount(p.views.count)) errs.push(`views.count ${p.views.count} out of range`);
  if (!Number.isFinite(p.views.elevationDeg)) errs.push("views.elevationDeg invalid");
  const bones = p.skeleton.bones;
  const boneIds = new Set(Object.keys(bones));
  const seen = /* @__PURE__ */ new Set();
  const visit = (id, depth) => {
    if (depth > 1e4 || seen.has(id)) {
      errs.push(`bone graph cycle at ${id}`);
      return;
    }
    seen.add(id);
    const b = bones[id];
    if (!b) {
      errs.push(`missing bone ${id}`);
      return;
    }
    if (!isVec3(b.rest?.position) || !isVec3(b.rest?.rotation)) errs.push(`bone ${b.name} has an invalid rest pose`);
    for (const c of b.children) {
      if (bones[c]?.parentId !== id) errs.push(`bone ${c} parent mismatch`);
      visit(c, depth + 1);
    }
  };
  for (const r of p.skeleton.rootOrder) {
    if (bones[r]?.parentId !== null) errs.push(`root ${r} has a parent`);
    visit(r, 0);
  }
  for (const id of boneIds) if (!seen.has(id)) errs.push(`bone ${id} unreachable from roots`);
  const partIds = Object.keys(p.parts);
  if (partIds.length !== p.partOrder.length || partIds.some((id) => !p.partOrder.includes(id))) errs.push("partOrder is not a permutation of parts");
  const authored = new Set(authoredViews(p.views.count, p.views.mirror));
  for (const part of Object.values(p.parts)) {
    if (!bones[part.boneId]) errs.push(`part ${part.name} is on missing bone ${part.boneId}`);
    if (!part.variants[part.defaultVariant]) errs.push(`part ${part.name} default variant missing`);
    if (part.variantOrder.length !== Object.keys(part.variants).length) errs.push(`part ${part.name} variantOrder mismatch`);
    if (part.solids) {
      if (part.solids.order.length !== Object.keys(part.solids.primitives).length) errs.push(`part ${part.name} solids order mismatch`);
      for (const prim of Object.values(part.solids.primitives)) if (!isVec3(prim.position) || !isVec3(prim.size) || !isVec3(prim.rotation)) errs.push(`solid ${prim.name} has invalid vectors`);
    }
    if (part.skin) {
      for (const id of part.skin.bones) if (!bones[id]) errs.push(`part ${part.name} skin refers to missing bone ${id}`);
      if (!(part.skin.falloff > 0) || !(part.skin.cell >= 1)) errs.push(`part ${part.name} skin settings invalid`);
    }
    for (const v of Object.values(part.variants)) {
      for (const [k, img] of Object.entries(v.images)) {
        const view = Number(k);
        if (!authored.has(view)) errs.push(`part ${part.name} has an image for non-authored view ${view}`);
        if (img.pixels.length !== img.width * img.height * 4) errs.push(`part ${part.name} view ${view} pixel buffer size mismatch`);
        if (img.width > p.canvas.size || img.height > p.canvas.size) errs.push(`part ${part.name} view ${view} image larger than the canvas`);
      }
    }
  }
  const animIds = Object.keys(p.animations);
  if (animIds.length !== p.animationOrder.length || animIds.some((id) => !p.animationOrder.includes(id))) errs.push("animationOrder is not a permutation of animations");
  for (const anim of Object.values(p.animations)) {
    if (anim.frameCount < 1 || anim.frameCount > MAX_FRAMES) errs.push(`animation ${anim.name} frameCount out of range`);
    if (!(anim.fps >= 0)) errs.push(`animation ${anim.name} fps invalid`);
    const checkKeys = (label, keys) => {
      for (let i2 = 0; i2 < keys.length; i2++) {
        const f = keys[i2].frame;
        if (f < 0 || f >= anim.frameCount) errs.push(`animation ${anim.name} ${label} key at frame ${f} out of range`);
        if (i2 > 0 && keys[i2 - 1].frame >= f) errs.push(`animation ${anim.name} ${label} keys not strictly sorted`);
      }
    };
    for (const [bid, t] of Object.entries(anim.boneTracks)) {
      if (!bones[bid]) errs.push(`animation ${anim.name} has a track for missing bone ${bid}`);
      checkKeys(`bone ${bid} rotation`, t.rotation);
      checkKeys(`bone ${bid} translate`, t.translate);
      checkKeys(`bone ${bid} scale`, t.scale);
    }
    for (const [pid, t] of Object.entries(anim.partTracks)) {
      if (!p.parts[pid]) errs.push(`animation ${anim.name} has a track for missing part ${pid}`);
      checkKeys(`part ${pid} visible`, t.visible);
      checkKeys(`part ${pid} variant`, t.variant);
    }
  }
  const palIds = Object.keys(p.palettes ?? {});
  if (palIds.length === 0) errs.push("project has no palette");
  if (!Array.isArray(p.paletteOrder) || palIds.length !== p.paletteOrder.length || palIds.some((id) => !p.paletteOrder.includes(id))) errs.push("paletteOrder is not a permutation of palettes");
  if (!p.palettes?.[p.activePaletteId]) errs.push(`activePaletteId ${p.activePaletteId} is not a palette`);
  for (const pal of Object.values(p.palettes ?? {})) {
    if (!Array.isArray(pal.colors)) {
      errs.push(`palette ${pal.name} has no colour list`);
      continue;
    }
    if (pal.colors.length > MAX_PALETTE) errs.push(`palette ${pal.name} has more than ${MAX_PALETTE} colours`);
    if (pal.colors.some((c) => !isColor(c))) errs.push(`palette ${pal.name} has an invalid colour`);
  }
  return errs;
}
var isColor = (c) => Array.isArray(c) && c.length === 4 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
function repairPalettes(p) {
  const raw = p.palettes && typeof p.palettes === "object" ? p.palettes : {};
  const palettes = {};
  for (const [id, pal] of Object.entries(raw)) {
    if (!pal || typeof pal !== "object") continue;
    const colors = Array.isArray(pal.colors) ? pal.colors.filter(isColor).slice(0, MAX_PALETTE).map((c) => [c[0], c[1], c[2], c[3]]) : [];
    palettes[id] = { id, name: typeof pal.name === "string" && pal.name.trim() ? pal.name : "Palette", colors };
  }
  const order = (Array.isArray(p.paletteOrder) ? p.paletteOrder : []).filter((id, i2, a) => palettes[id] && a.indexOf(id) === i2);
  for (const id of Object.keys(palettes)) if (!order.includes(id)) order.push(id);
  if (order.length === 0) {
    const pal = createPalette(PRESET_PALETTES[0].name, DEFAULT_PALETTE);
    palettes[pal.id] = pal;
    order.push(pal.id);
  }
  p.palettes = palettes;
  p.paletteOrder = order;
  if (!palettes[p.activePaletteId]) p.activePaletteId = order[0];
}

// ../ThreeSprite/src/core/io/projectFile.ts
function decodeProject(bytes) {
  let entries;
  try {
    entries = unzipSync(bytes);
  } catch (e) {
    throw new Error(`Not a ThreeSprite project (zip): ${e instanceof Error ? e.message : String(e)}`);
  }
  const jsonBytes = entries["project.json"];
  if (!jsonBytes) throw new Error("Not a ThreeSprite project: project.json missing");
  const parsed = JSON.parse(new TextDecoder().decode(jsonBytes));
  const warnings = [];
  if (parsed.formatVersion === 1) {
    migrateV1(parsed);
    warnings.push("Upgraded a version-1 project: bones were converted to the 3D rig; check the rest pose.");
  }
  if (parsed.formatVersion === 2) migrateV2(parsed);
  if (parsed.formatVersion !== FORMAT_VERSION) throw new Error(`Unsupported project format version ${parsed.formatVersion} (this app reads ${FORMAT_VERSION})`);
  const raw = parsed;
  for (const part of Object.values(raw.parts)) {
    if (part.foreshorten === void 0) part.foreshorten = true;
    for (const v of Object.values(part.variants)) {
      const refs = v.images;
      const images = {};
      for (const [k, ref] of Object.entries(refs)) {
        const data = entries[ref.$file];
        if (!data) {
          warnings.push(`Missing image ${ref.$file}`);
          continue;
        }
        try {
          images[Number(k)] = imageFromPng(data);
        } catch (e) {
          warnings.push(`Could not read ${ref.$file}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      v.images = images;
    }
  }
  if (raw.views.elevationDeg === void 0) raw.views.elevationDeg = 0;
  const problems = validate(raw);
  if (problems.length) warnings.push(...problems.map((p) => `Repairing: ${p}`));
  repairPalettes(raw);
  return { project: raw, warnings };
}
function migrateV2(p) {
  const raw = Array.isArray(p.palette?.colors) ? p.palette.colors : DEFAULT_PALETTE;
  const colors = raw.filter((c) => Array.isArray(c) && c.length === 4 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255));
  const pal = createPalette(presetNameFor(colors) ?? "Palette", colors);
  p.palettes = { [pal.id]: pal };
  p.paletteOrder = [pal.id];
  p.activePaletteId = pal.id;
  delete p.palette;
  p.formatVersion = 3;
}
function migrateV1(p) {
  const size = p.canvas.size;
  for (const b of Object.values(p.skeleton.bones)) {
    const r = b.rest;
    if (typeof r !== "object" || r === null || "position" in r) continue;
    const root = b.parentId === null;
    b.rest = root ? { position: { r: -(r.x - size / 2), u: size - r.y, f: 0 }, rotation: { r: 0, u: 0, f: r.rotation - 90 } } : { position: { r: -r.y, u: r.x, f: 0 }, rotation: { r: 0, u: 0, f: r.rotation } };
  }
  for (const anim of Object.values(p.animations)) {
    for (const [bid, t] of Object.entries(anim.boneTracks)) {
      const root = p.skeleton.bones[bid]?.parentId === null;
      for (const k of t.rotation) if (typeof k.value === "number") k.value = { r: 0, u: 0, f: k.value };
      for (const k of t.translate) {
        const v = k.value;
        if (v && typeof v.x === "number") k.value = root ? { r: -v.x, u: -v.y, f: 0 } : { r: -v.y, u: v.x, f: 0 };
      }
      for (const k of t.scale) {
        const v = k.value;
        if (v && typeof v.x === "number") k.value = { r: v.y, u: v.x, f: 1 };
      }
    }
  }
  p.views.elevationDeg = 0;
  p.formatVersion = 2;
}
function imageFromPng(bytes) {
  const d = decodePng(bytes);
  const n = d.width * d.height;
  const out = new Uint8ClampedArray(n * 4);
  const src = d.data;
  const shift = d.depth === 16 ? 8 : 0;
  const ch = d.channels;
  const pal = d.palette;
  if (pal && ch === 1) {
    for (let i2 = 0; i2 < n; i2++) {
      const idx = src[i2] >> shift;
      const c = pal[idx] ?? [0, 0, 0];
      out[i2 * 4] = c[0];
      out[i2 * 4 + 1] = c[1];
      out[i2 * 4 + 2] = c[2];
      out[i2 * 4 + 3] = c.length > 3 ? c[3] : 255;
    }
    return { width: d.width, height: d.height, pixels: out };
  }
  for (let i2 = 0; i2 < n; i2++) {
    const s = i2 * ch;
    if (ch === 4) {
      out[i2 * 4] = src[s] >> shift;
      out[i2 * 4 + 1] = src[s + 1] >> shift;
      out[i2 * 4 + 2] = src[s + 2] >> shift;
      out[i2 * 4 + 3] = src[s + 3] >> shift;
    } else if (ch === 3) {
      out[i2 * 4] = src[s] >> shift;
      out[i2 * 4 + 1] = src[s + 1] >> shift;
      out[i2 * 4 + 2] = src[s + 2] >> shift;
      out[i2 * 4 + 3] = 255;
    } else if (ch === 2) {
      const g = src[s] >> shift;
      out[i2 * 4] = g;
      out[i2 * 4 + 1] = g;
      out[i2 * 4 + 2] = g;
      out[i2 * 4 + 3] = src[s + 1] >> shift;
    } else {
      const g = src[s] >> shift;
      out[i2 * 4] = g;
      out[i2 * 4 + 1] = g;
      out[i2 * 4 + 2] = g;
      out[i2 * 4 + 3] = 255;
    }
  }
  return { width: d.width, height: d.height, pixels: out };
}

// ../ThreeSprite/runtime/src/angles.ts
var TAU = Math.PI * 2;
var mod1 = (turns) => (turns % 1 + 1) % 1;
function relativeTurns(bearingTurns, facingTurns) {
  return mod1(bearingTurns - facingTurns);
}
function viewFor(count, relative) {
  const n = Math.max(1, Math.round(count));
  return Math.round(mod1(relative) * n) % n + 1;
}
function viewAngleTurns(count, view) {
  return (view - 1) / Math.max(1, Math.round(count));
}

// ../ThreeSprite/runtime/src/manifest.ts
var ManifestError = class extends Error {
  constructor(message) {
    super(`ThreeSprite manifest: ${message}`);
    this.name = "ManifestError";
  }
};
var isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var isRect = (v) => isObject(v) && ["x", "y", "w", "h"].every((k) => Number.isFinite(v[k]));
function parseManifest(input) {
  const m = typeof input === "string" ? JSON.parse(input) : input;
  if (!isObject(m)) throw new ManifestError("expected an object");
  if (m.format !== "threesprite-atlas") {
    throw new ManifestError(`expected format "threesprite-atlas", got ${JSON.stringify(m.format)}. Export with "Atlas + JSON".`);
  }
  if (!Number.isFinite(m.version)) throw new ManifestError("missing version");
  if (m.version > 1) {
    throw new ManifestError(`version ${m.version} is newer than this library understands (1)`);
  }
  const views = m.views;
  if (!isObject(views) || !Number.isFinite(views.count) || views.count < 1) {
    throw new ManifestError("views.count is missing or not a positive number");
  }
  if (!Array.isArray(views.list)) throw new ManifestError("views.list is missing");
  if (!isObject(m.frames)) throw new ManifestError("frames table is missing");
  for (const [key, frame] of Object.entries(m.frames)) {
    if (!isObject(frame) || !isRect(frame.rect) || !isRect(frame.source) || !isObject(frame.pivot)) {
      throw new ManifestError(`frame ${JSON.stringify(key)} is missing a rect, source or pivot`);
    }
  }
  if (!Array.isArray(m.animations)) throw new ManifestError("animations are missing");
  for (const a of m.animations) {
    if (!isObject(a) || typeof a.name !== "string") throw new ManifestError("an animation has no name");
    if (!Array.isArray(a.frames)) throw new ManifestError(`animation ${JSON.stringify(a.name)} has no frames`);
    for (const f of a.frames) {
      if (!isObject(f) || !isObject(f.views)) throw new ManifestError(`animation ${JSON.stringify(a.name)} has a frame with no views`);
      for (const [view, key] of Object.entries(f.views)) {
        if (typeof key !== "string" || !(key in m.frames)) {
          throw new ManifestError(`animation ${JSON.stringify(a.name)} frame ${f.index} view ${view} points at a frame that is not in the sheet`);
        }
      }
    }
  }
  return m;
}

// ../ThreeSprite/runtime/src/playback.ts
function frameAt(timing, seconds) {
  const n = Math.max(1, Math.floor(timing.frameCount));
  if (n <= 1 || !(timing.fps > 0) || !(seconds > 0)) return 0;
  const f = Math.floor(seconds * timing.fps);
  return timing.loop ? f % n : Math.min(f, n - 1);
}
function durationSeconds(timing) {
  const n = Math.max(1, Math.floor(timing.frameCount));
  return timing.fps > 0 ? n / timing.fps : 0;
}
function isFinished(timing, seconds) {
  if (timing.loop) return false;
  const d = durationSeconds(timing);
  return d > 0 && seconds >= d;
}

// ../ThreeSprite/runtime/src/sheet.ts
var TSpriteSheet = class _TSpriteSheet {
  constructor(manifest) {
    this.manifest = manifest;
    this.byName = /* @__PURE__ */ new Map();
    for (const meta of manifest.animations) {
      const timing = { fps: meta.fps, frameCount: meta.frames.length, loop: meta.loop };
      this.byName.set(meta.name, {
        meta,
        animation: { name: meta.name, ...timing, duration: durationSeconds(timing) }
      });
    }
  }
  /** Parse a manifest, from an object or a JSON string. Throws `ManifestError` on bad input. */
  static parse(input) {
    return new _TSpriteSheet(parseManifest(input));
  }
  get sprite() {
    return this.manifest.sprite;
  }
  /** File name of the sheet PNG, beside the manifest. */
  get image() {
    return this.manifest.image;
  }
  /** Size of the sheet in pixels. */
  get size() {
    return this.manifest.size;
  }
  /** The square canvas every frame was drawn on. */
  get canvas() {
    return this.manifest.canvas;
  }
  /** Height of the character in world units, for scaling the quad. */
  get worldHeight() {
    return this.manifest.worldHeight;
  }
  get viewCount() {
    return this.manifest.views.count;
  }
  get animationNames() {
    return [...this.byName.keys()];
  }
  animation(name) {
    const entry = name === void 0 ? this.byName.values().next().value : this.byName.get(name);
    return entry?.animation;
  }
  frame(key) {
    return this.manifest.frames[key];
  }
  /** The view a camera sees, from 1 to `viewCount`. */
  viewFor(look) {
    const relative = look.relative ?? relativeTurns(look.bearing ?? 0, look.facing ?? 0);
    return viewFor(this.viewCount, relative);
  }
  /** The relative bearing a view is drawn at, in turns. */
  viewAngle(view) {
    return viewAngleTurns(this.viewCount, view);
  }
  /** How far the camera is from the centre of the view it is being shown, in turns (0 to 0.5). */
  viewError(look) {
    const relative = mod1(look.relative ?? relativeTurns(look.bearing ?? 0, look.facing ?? 0));
    const off = mod1(relative - this.viewAngle(this.viewFor(look)));
    return Math.min(off, 1 - off);
  }
  /** Whether a one-shot animation has run out by `seconds`. */
  finished(animation, seconds) {
    const a = this.animation(animation);
    return a ? isFinished(a, seconds) : false;
  }
  /**
   * Everything needed to draw one sprite this tick.
   *
   * Returns undefined only when the animation is not in the sheet, or when the
   * frame it picked has no picture for that view, which an export never
   * produces but a hand-edited manifest might.
   */
  resolve(request = {}) {
    const entry = request.animation === void 0 ? this.byName.values().next().value : this.byName.get(request.animation);
    if (!entry) return void 0;
    const { meta, animation } = entry;
    const frameIndex = request.frame !== void 0 ? Math.min(Math.max(0, Math.floor(request.frame)), Math.max(0, meta.frames.length - 1)) : frameAt(animation, request.time ?? 0);
    const view = this.viewFor(request);
    const frameMeta = meta.frames[frameIndex];
    const key = frameMeta?.views[String(view)];
    if (key === void 0) return void 0;
    const f = this.manifest.frames[key];
    if (!f) return void 0;
    return {
      key,
      view,
      frame: frameIndex,
      rect: f.rect,
      source: f.source,
      pivot: { x: f.pivot.x * f.rect.w, y: f.pivot.y * f.rect.h },
      pivotNormalised: f.pivot
    };
  }
};

// ../ThreeSprite/runtime/src/tsprite.ts
function loadTsprite(bytes, options = {}) {
  const { project, warnings } = decodeProject(bytes);
  const wanted = options.animations;
  const animIds = project.animationOrder.filter((id) => !wanted || wanted.includes(project.animations[id].name));
  if (animIds.length === 0) {
    throw new Error(
      wanted ? `none of the requested animations are in this sprite (it has ${project.animationOrder.map((id) => project.animations[id].name).join(", ") || "none"})` : "this sprite has no animations"
    );
  }
  const collected = collectFrames(project, animIds, options.onProgress);
  const atlas = buildAtlas({
    sprite: project.spriteName,
    canvas: project.canvas.size,
    views: { count: project.views.count, mirror: project.views.mirror },
    worldHeight: project.export.worldHeight,
    animations: collected.animations,
    frames: collected.frames,
    buffers: collected.buffers,
    pow2: options.pow2 ?? false
  });
  return {
    sheet: TSpriteSheet.parse(atlas.manifest),
    rgba: atlas.rgba,
    width: atlas.width,
    height: atlas.height,
    png: atlas.png,
    manifestJson: atlas.json,
    warnings: [...warnings, ...atlas.warnings]
  };
}
function inspectTsprite(bytes) {
  const { project } = decodeProject(bytes);
  return {
    name: project.name,
    sprite: project.spriteName,
    canvas: project.canvas.size,
    views: project.views.count,
    animations: project.animationOrder.map((id) => {
      const a = project.animations[id];
      return { name: a.name, fps: a.fps, loop: a.loop, frameCount: a.frameCount };
    })
  };
}
export {
  inspectTsprite,
  loadTsprite
};
