import json, math
from style import *
import importlib.util
exec(open('proto.py').read().split("res={}")[0])
ah=json.load(open('ah.json'))
def sim(TA,TB,a,T=400000):
    tA=0.0; lastB=170.0-TB; nextB=170.0; nA=nB=0; bt=[]
    while min(tA,nextB)<T:
        if tA<=nextB:
            phi=(tA-lastB)/TB
            if 0<=phi<1: nextB=max(tA+1,nextB+TB*a*math.sin(2*math.pi*phi))
            nA+=1; tA+=TA
        else:
            nB+=1; bt.append(nextB); lastB=nextB; nextB+=TB
    return nB/max(nA,1), np.diff(bt)
f=fig(12,7.6)
def panel(rect,title,sub):
    ax=f.add_axes(rect); ax.set_facecolor(BG)
    for s in ax.spines.values(): s.set_color(RULE); s.set_linewidth(0.7)
    ax.tick_params(colors=TXT2,labelsize=6.5,length=2,width=0.5)
    for l in ax.get_xticklabels()+ax.get_yticklabels(): l.set_fontproperties(SANS)
    f.text(rect[0],rect[1]+rect[3]+0.035,title,fontproperties=ITAL,fontsize=11,color=TXT)
    f.text(rect[0],rect[1]+rect[3]+0.012,sub,fontproperties=SANS,fontsize=6.6,color=TXT2)
    return ax
def fonts(ax):
    for l in ax.get_xticklabels()+ax.get_yticklabels(): l.set_fontproperties(SANS); l.set_fontsize(6.5)
# AH jump
ax=panel([0.07,0.58,0.36,0.27],'Echo · the jump','Engine run · S2 coupling (ms) against septal-atrium-to-His interval (ms), drive 600 ms')
x=[p[0] for p in ah]; y=[p[1] for p in ah]
lo=[p for p in ah if p[1]<200]; hi=[p for p in ah if p[1]>=200]
for seg,c in ((lo,GOLD),(hi,BLUE)):
    glowline(ax,[p[0] for p in seg],[p[1] for p in seg],c,c,lw=0.8,alpha=0.6)
    ax.scatter([p[0] for p in seg],[p[1] for p in seg],s=7,color=c,zorder=6,lw=0)
ax.invert_xaxis(); ax.set_ylim(60,340); fonts(ax)
ax.annotate('',xy=(296,280),xytext=(300,118),arrowprops=dict(arrowstyle='-',color=TXT,lw=0.6,ls=(0,(2,2)),alpha=0.6))
ax.text(292,200,'+178 ms',fontproperties=ITAL,fontsize=9,color=TXT,alpha=0.85)
def ret(rect,iv,title,sub,c=GOLD,lim=None):
    ax=panel(rect,title,sub); iv=np.asarray(iv,dtype=float)
    n=len(iv)-1; al=np.linspace(0.12,1,n)
    if lim: ax.set_xlim(*lim); ax.set_ylim(*lim)
    lo_,hi_=ax.get_xlim(); ax.plot([lo_,hi_],[lo_,hi_],color=RULE,lw=0.6,zorder=1)
    ax.scatter(iv[:-1],iv[1:],s=55,color=c,alpha=0.035,lw=0,zorder=4)
    ax.scatter(iv[:-1],iv[1:],s=9,c=[(*matplotlib.colors.to_rgb(c),a) for a in al],lw=0,zorder=5)
    ax.set_aspect('equal',adjustable='box'); fonts(ax); return ax
t=0; rr=[]
for k in range(200):
    r=800*(1+0.05*math.sin(2*math.pi*t/4000)); rr.append(r); t+=r
ret([0.50,0.58,0.19,0.27],rr,'Prelude · breath','RR(n) against RR(n+1), ms · §C prototype',lim=(740,860))
o,h=avn(300,n=200,ahmin=60,A=300,tau=120,erp=170)
ret([0.76,0.58,0.19,0.27],np.diff(h),'Meter · 6 : 5','His intervals, drive 300 ms · §B prototype',lim=(250,700))
r1,iv1=sim(720,1030,0.08); r2,iv2=sim(720,1030,0.17)
ret([0.50,0.13,0.19,0.27],iv1[-300:],'Hemiola · drifting','B intervals, coupling 0.08 · §D prototype',c=BLUE,lim=(880,1180))
ret([0.76,0.13,0.19,0.27],iv2[-300:],'Hemiola · locked 2 : 3','B intervals, coupling 0.17 · §D prototype',c=BLUE,lim=(880,1180))
# staircase
ax=panel([0.07,0.13,0.36,0.27],'Hemiola · staircase','Prototype of §D · B beats per A beat against coupling a (A 720 ms, B 1030 ms)')
As=np.linspace(0,0.3,241); R=[sim(720,1030,a,T=300000)[0] for a in As]
ax.plot(As,R,color=BLUE,lw=0.9,alpha=0.9); ax.scatter(As,R,s=3,color=BLUEC,lw=0,alpha=0.7)
for v,l in ((2/3,'2 : 3'),(3/4,'3 : 4')):
    ax.axhline(v,color=RULE,lw=0.6); ax.text(0.302,v,l,fontproperties=ITAL,fontsize=9,color=TXT,va='center')
ax.scatter([0.17],[2/3],s=70,color=GOLD,zorder=8,lw=0); ax.scatter([0.17],[2/3],s=300,color=GOLD,alpha=0.12,zorder=7,lw=0)
ax.set_xlim(0,0.3); ax.set_ylim(0.62,0.80); fonts(ax)
f.text(0.5,0.045,spaced('Laboratory · curves and return plots'),fontproperties=ITAL,fontsize=15,color=TXT,ha='center')
f.text(0.5,0.018,'Concept plate 4 · the jump curve is from the v0.1 engine; Meter and Hemiola use prototypes of the v1.1 rules (§B, §D) written for this spec. Points fade with age.',fontproperties=SANS,fontsize=7.2,color=TXT2,ha='center')
f.savefig('plate4_lab.png',facecolor=BG); print('ok', r2)
