import json
from style import *
from matplotlib.markers import MarkerStyle
from matplotlib.transforms import Affine2D
NH=MarkerStyle('o',transform=Affine2D().scale(1.45,1.0).rotate_deg(22))
d=json.load(open('echo_events.json')); E=d['events']
acts=[e for e in E if e['type']=='activation']
ch=[('HRA','High atrium','D4'),('H','His','A5'),('CSp','Septal atrium','F4'),('V','Ventricle','D3')]
t0,t1=3700,5950
f=fig(12,6.6); ax=f.add_axes([0.13,0.22,0.83,0.70]); ax.set_facecolor(BG); ax.axis('off')
ax.set_xlim(t0,t1); ax.set_ylim(-0.9,len(ch)*1.6-0.4)
t=np.linspace(t0,t1,6000)
def kernel(n,x):
    if n=='H': w=6; return 0.35*(np.exp(-((x)/w)**2)*np.sin(x/3.0))
    if n=='V': w=26; return 1.25*(-np.exp(-((x-6)/w)**2)*np.sin((x-6)/11.0)) + 0.25*np.exp(-((x+30)/40)**2)*0
    w=12; return 0.75*np.exp(-((x)/w)**2)*np.sin(x/5.5)
for i,(n,lab,pitch) in enumerate(ch):
    y0=(len(ch)-1-i)*1.6
    for k in range(-2,3): ax.plot([t0,t1],[y0+k*0.16]*2,color=RULE,lw=0.5,zorder=1)
    sig=np.zeros_like(t)
    on=[a['tMs'] for a in acts if a['nodeId']==n and t0<=a['tMs']<=t1]
    for o in on: sig+=kernel(n,t-o)
    # far-field hint on V channel? none
    glowline(ax,t,y0+sig*0.62,BLUE if n=='H' else GOLD,GOLDC,lw=0.8,alpha=0.85,z=3)
    for o in on:
        ax.scatter([o],[y0+0.32],marker=NH,s=40,color=TXT,alpha=0.9,lw=0,zorder=6)
        ax.plot([o+7,o+7],[y0+0.34,y0+0.78],color=TXT,lw=0.7,alpha=0.75,zorder=6)
    f.text(0.115,0.22+0.70*(y0+0.9)/(len(ch)*1.6-0.4+0.9),lab,fontproperties=ITAL,fontsize=10,color=TXT2,ha='right',va='center')
    f.text(0.115,0.22+0.70*(y0+0.9)/(len(ch)*1.6-0.4+0.9)-0.032,pitch,fontproperties=SANS,fontsize=7,color=TXT2,ha='right',va='center',alpha=0.8)
# calipers
def caliper(xa,xb,y,label):
    for x in (xa,xb): ax.plot([x,x],[-0.55,len(ch)*1.6-0.6],color=BLUEC,lw=0.6,alpha=0.35,zorder=7,ls=(0,(2,3)))
    ax.plot([xa,xb],[y,y],color=BLUEC,lw=0.8,alpha=0.8,zorder=8)
    for x in (xa,xb): ax.plot([x,x],[y-0.07,y+0.07],color=BLUEC,lw=0.8,alpha=0.8,zorder=8)
    ax.text((xa+xb)/2,y-0.2,label,fontproperties=SANS4,fontsize=7.5,color=BLUEC,ha='center',va='center',zorder=9)
g=lambda n,lo,hi:[a['tMs'] for a in acts if a['nodeId']==n and lo<=a['tMs']<=hi]
c1=g('CSp',4390,4410)[0]; v1=g('V',4400,4600)[0]
caliper(c1,v1,-0.62,f'{round(v1-c1)} ms')
cs=g('CSp',5200,5950); caliper(cs[0],cs[1],-0.62,'303 ms  ·  A : V  1 : 1')
ax.text((c1+v1)/2+260,-0.62,'',fontproperties=ITAL)
caption(f,'Staves · Echo','Concept plate 2 · the same engine run as plate 1 on intracardiac-style staves. Synthetic electrograms (labelled as such in the Lab), note heads at onsets, two calipers.',y=0.07)
f.savefig('plate2_staves.png',facecolor=BG); print('ok')
