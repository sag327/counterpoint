import json, math
from style import *
s12=json.load(open('s1s2.json')); dec=json.load(open('dec.json'))
f=fig(12,7.8)
def panel(rect,title,sub):
    ax=f.add_axes(rect); ax.set_facecolor(BG)
    for s in ax.spines.values(): s.set_color(RULE); s.set_linewidth(0.7)
    ax.tick_params(colors=TXT2,labelsize=6.5,length=2,width=0.5)
    f.text(rect[0],rect[1]+rect[3]+0.038,title,fontproperties=ITAL,fontsize=11.5,color=TXT)
    f.text(rect[0],rect[1]+rect[3]+0.014,sub,fontproperties=SANS,fontsize=6.6,color=TXT2)
    return ax
def fonts(ax):
    for l in ax.get_xticklabels()+ax.get_yticklabels(): l.set_fontproperties(SANS); l.set_fontsize(6.5)
def lab(ax,x,y): ax.set_xlabel(x,fontproperties=SANS,fontsize=7,color=TXT2); ax.set_ylabel(y,fontproperties=SANS,fontsize=7,color=TXT2)
# --- Panel A: site inspector restitution
Em,A,tau,Emin=300,60,120,200
ax=panel([0.06,0.42,0.25,0.38],'Site · fast pathway','Refractory restitution · drag the handles or type values')
DI=np.linspace(0,600,300); ERP=np.clip(Em-A*np.exp(-DI/tau),Emin,Em)
glowline(ax,DI,ERP,GOLD,GOLDC,lw=1.0)
# handles
for (x,y,l) in [(600,Em,'E max'),(0,Em-A,'E max − A'),(tau,Em-A*math.exp(-1),'tau')]:
    ax.scatter([x],[y],s=46,facecolor=BG,edgecolor=BLUEC,lw=1.0,zorder=8)
    ax.text(x+(14 if x<500 else -14),y+(-7 if x<500 else 6),l,fontproperties=ITAL,fontsize=8.5,color=BLUEC,ha='left' if x<500 else 'right',zorder=9)
# live point
dlive=28; elive=Em-A*math.exp(-dlive/tau)
for s_,a_ in [(400,0.06),(120,0.15),(30,1)]: ax.scatter([dlive],[elive],s=s_,color=GOLDC,alpha=a_,lw=0,zorder=9)
ax.text(dlive+16,elive-9,'now',fontproperties=ITAL,fontsize=8.5,color=GOLDC)
ax.set_xlim(-15,620); ax.set_ylim(225,310); fonts(ax); lab(ax,'diastolic interval (ms)','ERP (ms)')
# slope band where >1 none here; show slope readout
f.text(0.06,0.355,'E max  300 ms     A  60 ms     tau  120 ms     E min  200 ms',fontproperties=SANS4,fontsize=7.2,color=TXT)
f.text(0.06,0.33,'slope at current DI  0.40   ·   alternans needs slope > 1',fontproperties=SANS,fontsize=6.8,color=TXT2)
# --- Panel B: S1S2 refractory curves
ax=panel([0.385,0.42,0.25,0.38],'S1–S2 · output against input','Engine run · Echo, drive 600 ms from septal atrium')
lo=[p for p in s12 if p['h1h2'] and p['a2h2']<200]; hi=[p for p in s12 if p['h1h2'] and p['a2h2']>=200]
ax.plot([200,460],[200,460],color=RULE,lw=0.6)
for seg,c in ((lo,GOLD),(hi,BLUE)):
    ax.scatter([p['cs'] for p in seg],[p['h1h2'] for p in seg],s=8,color=c,lw=0,zorder=6)
    glowline(ax,[p['cs'] for p in seg],[p['h1h2'] for p in seg],c,c,lw=0.7,alpha=0.5)
for x,l,yy,ha in [(296,'fast ERP',525,'left'),(238,'slow ERP',270,'left'),(228,'atrial ERP',262,'right')]:
    ax.axvline(x,color=TXT2,lw=0.5,ls=(0,(2,3)),alpha=0.7)
    ax.text(x+(3 if ha=='left' else -3),yy,l,fontproperties=ITAL,fontsize=8.5,color=TXT,alpha=0.85,ha=ha,va='center')
ax.set_xlim(180,450); ax.set_ylim(250,540); fonts(ax); lab(ax,'A1–A2 (ms)','H1–H2 (ms)')
# --- Panel C: conduction restitution / decrement
ax=panel([0.71,0.42,0.25,0.38],'Link · slow pathway','Conduction time against recovery · curve = parameters, dots = engine events')
x=np.linspace(0,700,300); y=160+60*np.exp(-x/120)
glowline(ax,x,y,BLUE,BLUEC,lw=0.9,alpha=0.8)
ax.scatter([p[0] for p in dec],[p[1] for p in dec],s=10,color=GOLD,lw=0,zorder=7)
ax.set_xlim(-10,710); ax.set_ylim(155,225); fonts(ax); lab(ax,'recovery since ERP ended (ms)','conduction time (ms)')
ax.text(360,212,'decrement  60 ms  ·  tau 120 ms',fontproperties=SANS4,fontsize=7,color=TXT,ha='center')
# --- Bottom: music glossary layering
y0=0.205
f.text(0.06,y0+0.045,'Music, explained in layers',fontproperties=ITAL,fontsize=11.5,color=TXT)
chips=[('rhythm',1),('arpeggio',1),('chord',1),('rest',1),('echo',1),('round',1),('hemiola',2),('ostinato',2),('retrograde',2)]
x=0.06
for t,lvl in chips:
    w=0.010+0.0058*len(t)+(0.012 if lvl==2 else 0)
    ax2=f.add_axes([x,y0-0.012,w,0.034]); ax2.axis('off'); ax2.set_xlim(0,1); ax2.set_ylim(0,1)
    ax2.add_patch(matplotlib.patches.FancyBboxPatch((0.02,0.05),0.96,0.9,boxstyle='round,pad=0,rounding_size=0.45',fc='none',ec=GOLD if lvl==1 else BLUE,lw=0.8,alpha=0.9,transform=ax2.transAxes,mutation_aspect=0.25))
    ax2.text(0.5 if lvl==1 else 0.44,0.47,t,fontproperties=SANS4,fontsize=7.6,color=TXT,ha='center',va='center')
    if lvl==2: ax2.text(0.86,0.5,'+',fontproperties=SANS4,fontsize=8,color=BLUE,ha='center',va='center')
    x+=w+0.006
# tooltip card for hemiola
cx0=0.64; ax3=f.add_axes([cx0,0.10,0.32,0.17]); ax3.axis('off'); ax3.set_xlim(0,1); ax3.set_ylim(0,1)
ax3.add_patch(matplotlib.patches.FancyBboxPatch((0.01,0.03),0.98,0.94,boxstyle='round,pad=0,rounding_size=0.04',fc='#0D1520',ec=RULE,lw=0.8))
ax3.text(0.05,0.80,'Hemiola',fontproperties=ITAL,fontsize=11,color=TXT)
ax3.text(0.05,0.60,'Three beats of one voice against two of the other.',fontproperties=SANS4,fontsize=7.6,color=TXT)
ax3.text(0.05,0.44,'Here it appears when the two pacemakers lock 2 : 3.',fontproperties=SANS,fontsize=7.4,color=TXT2)
ax3.text(0.05,0.20,'Hear it  ·  Show the beats  ·  Read more',fontproperties=SANS4,fontsize=7.4,color=GOLD)
f.text(0.06,0.135,'Gold chips are plain words, shown inline.  Blue chips (+) are hinted: one tap opens a two-line card;',fontproperties=SANS,fontsize=6.9,color=TXT2)
f.text(0.06,0.115,'"Read more" opens the liner notes.',fontproperties=SANS,fontsize=6.9,color=TXT2)
f.text(0.5,0.045,spaced('Model · visible and adjustable'),fontproperties=ITAL,fontsize=15,color=TXT,ha='center')
f.text(0.5,0.018,'Concept plate 6 · S1–S2 and conduction panels are v0.1 engine runs of Echo; the restitution panel shows v1.1 §A parameters. Handles edit the model through logged commands.',fontproperties=SANS,fontsize=7.2,color=TXT2,ha='center')
f.savefig('plate6_model.png',facecolor=BG); print('ok')
