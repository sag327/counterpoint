import math
from style import *
f=fig(12,7.2); ax=f.add_axes([0,0,1,1]); ax.set_facecolor(BG); ax.axis('off'); ax.set_xlim(0,12); ax.set_ylim(0,7.2)
rng=np.random.default_rng(7)
# sculpture: faint ring right side
cx,cy,R=8.7,3.75,2.05
th=np.linspace(0,2*math.pi,600)
for s in range(7):
    amp=rng.uniform(0.01,0.05); ph=rng.uniform(0,6.3); k=rng.integers(5,9)
    r=R+amp*np.sin(k*th+ph)
    col=GOLD if s%2 else BLUE
    ax.plot(cx+r*np.cos(th),cy+r*np.sin(th),color=col,lw=0.5,alpha=0.22 if s else 0.45)
for i in range(8):
    a=math.pi/2-i*2*math.pi/8; x,y=cx+R*math.cos(a),cy+R*math.sin(a)
    pearl(ax,x,y,GOLD if i in (0,1) else '#C9CFD6','#FFFFFF',s=40,glow=1.4 if i==1 else 0.7)
# wave head glow
a=math.pi/2-1.45*2*math.pi/8; x,y=cx+R*math.cos(a),cy+R*math.sin(a)
for s_,al in [(900,0.03),(300,0.07),(60,0.25),(10,0.9)]: ax.scatter([x],[y],s=s_,color=GOLDC,alpha=al,lw=0)
# text block
ax.text(0.9,6.3,spaced('COUNTERPOINT',2),fontproperties=SERIF,fontsize=21,color=TXT,ha='left',va='center')
ax.text(0.9,5.85,spaced('Study No. 2',1),fontproperties=ITAL,fontsize=13,color=TXT2,ha='left',va='center')
ax.text(0.9,5.3,'The heart does not provide a soundtrack.\nIt provides the rules by which a composition comes into existence.',fontproperties=ITAL,fontsize=10.5,color=TXT,alpha=0.8,ha='left',va='top',linespacing=1.5)
prog=[('I','Prelude','a fermata, then the breath returns'),('II','Echo','an arpeggio folds into a chord'),('III','Meter','time signatures from a slowing path'),('IV','Ostinato','a fast figure and its shadow'),('V','Retrograde','a melody, and the same melody backwards'),('VI','Ghost','a voice silenced by its own echo'),('VII','Canon','a round that finds its own spacing'),('VIII','Hemiola','two tempi learn to listen')]
y=4.2
for n,t,s in prog:
    ax.text(1.25,y,n,fontproperties=SERIF,fontsize=9,color=TXT2,ha='right',va='center')
    ax.text(1.45,y,t,fontproperties=SERIF,fontsize=12,color=TXT,ha='left',va='center')
    ax.text(3.05,y,s,fontproperties=ITAL,fontsize=10,color=TXT2,ha='left',va='center')
    y-=0.34
ax.text(1.45,y-0.12,'Coda · Unknown',fontproperties=ITAL,fontsize=11,color=TXT,alpha=0.85,ha='left',va='center')
# enter button
bx,by=1.45,0.55
ax.add_patch(matplotlib.patches.FancyBboxPatch((bx,by-0.2),1.35,0.42,boxstyle='round,pad=0.0,rounding_size=0.21',fc='none',ec=GOLD,lw=0.9,alpha=0.9))
ax.text(bx+0.675,by+0.01,spaced('Enter'),fontproperties=SERIF,fontsize=11,color=GOLDC,ha='center',va='center')
ax.text(bx+1.65,by+0.01,'Notes   ·   Download for offline',fontproperties=SANS,fontsize=8,color=TXT2,ha='left',va='center')
ax.text(11.4,0.55,'Concept plate 5 · GitHub Pages title plate',fontproperties=SANS,fontsize=7,color=TXT2,ha='right',alpha=0.8)
f.savefig('plate5_landing.png',facecolor=BG); print('ok')
