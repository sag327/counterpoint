import json
from style import *
d=json.load(open('echo_events.json')); E=d['events']
byid={e['eventId']:e for e in E}
tiers=[('HRA','High atrium'),('CSp','Septal atrium'),('FP','Fast pathway'),('SP','Slow pathway'),('LCP','Lower node'),('H','His'),('V','Ventricle')]
Y={'HRA':6.0,'CSp':5.0,'FP':3.85,'SP':3.15,'LCP':2.1,'H':1.1,'V':0.0}
order=['HRA','CSp','FP','SP','LCP','H','V']; rank={n:i for i,n in enumerate(order)}
t0,t1=3150,6050
links={}
launches=[e for e in E if e['type']=='conduction_launched']
arr={e['transitId']:e for e in E if e['type']=='conduction_arrived'}
coll={}
for e in E:
    if e['type']=='conduction_collision':
        for tid in e['transitIds']: coll[tid]=e
acts=[e for e in E if e['type']=='activation']
capturedArr=set()
for a in acts:
    for c in a['causeIds']:
        if byid[c]['type']=='conduction_arrived': capturedArr.add(c)
blocked=[e for e in E if e['type']=='activation_blocked']
f=fig(12,6.2); ax=f.add_axes([0.10,0.20,0.86,0.70]); ax.set_facecolor(BG)
ax.set_xlim(t0,t1); ax.set_ylim(-0.6,6.6); ax.axis('off')
for n,lab in tiers:
    ax.plot([t0,t1],[Y[n]]*2,color=RULE,lw=0.6,zorder=1)
    f.text(0.095,0.20+0.70*(Y[n]+0.6)/7.2,lab,fontproperties=ITAL,fontsize=9.5,color=TXT2,ha='right',va='center')
# node band for AV region
ax.fill_between([t0,t1],2.1,5.0,color='#0C1520',zorder=0)
for L in launches:
    a,b=L['fromNodeId'],L['toNodeId']
    if a=='S' or b=='S': continue
    td,ta=L['departureMs'],L['arrivalMs']; tid=L['transitId']
    if ta<t0 or td>t1: continue
    retro = rank[b]<rank[a]
    col,core=(BLUE,BLUEC) if retro else (GOLD,GOLDC)
    if tid in coll:
        c=coll[tid]; tc=c['tMs']; frac=(tc-td)/(ta-td)
        xe,ye=tc,Y[a]+frac*(Y[b]-Y[a])
        glowline(ax,[td,xe],[Y[a],ye],col,core,lw=0.9,alpha=0.8)
        ax.scatter([xe],[ye],s=30,color=TXT,alpha=0.25,lw=0,zorder=5); ax.scatter([xe],[ye],s=6,color=TXT,alpha=0.7,lw=0,zorder=6)
    elif tid in arr:
        ar=arr[tid]
        if ar['eventId'] in capturedArr:
            glowline(ax,[td,ta],[Y[a],Y[b]],col,core,lw=1.0)
        else:
            fr=0.82; xe=td+fr*(ta-td); ye=Y[a]+fr*(Y[b]-Y[a])
            glowline(ax,[td,xe],[Y[a],ye],col,core,lw=1.0)
            ax.plot([xe-26,xe+26],[ye,ye],color=col,lw=1.4,alpha=0.95,zorder=6)
        if False:
            # block bar perpendicular-ish: short horizontal tick across line end
            dy=0.16
            ax.plot([ta-22,ta+22],[Y[b]+ (dy if retro else -dy)*0+ (0.18 if not retro else -0.18)]*2,color=col,lw=1.3,alpha=0.9,zorder=6)
for a in acts:
    if a['nodeId']=='S' or a['tMs']<t0 or a['tMs']>t1: continue
    n=a['nodeId']; src=a['source']
    col,core=(GOLD,GOLDC)
    if n in ('HRA','CSp') and any(byid[c]['type']=='conduction_arrived' and byid[byid[c]['transitId'] and c]['nodeId'] for c in a['causeIds']):
        pass
    if n in ('FP','SP','LCP'):
        ax.scatter([a['tMs']],[Y[n]],s=22,facecolor=BG,edgecolor=TXT,lw=0.9,alpha=0.8,zorder=8)
    else:
        pearl(ax,a['tMs'],Y[n],GOLD,GOLDC,s=30)
for t,n in d['stims']:
    if t0<=t<=t1:
        ax.scatter([t],[6.45],marker='v',s=26,facecolor='none',edgecolor=TXT2,lw=0.8,zorder=7)
# playhead
tp=t0+0.72*(t1-t0); ax.plot([tp,tp],[-0.5,6.55],color=TXT,alpha=0.18,lw=0.7,zorder=2)
# annotations
def note(x,y,s,ha='center'):
    ax.text(x,y,s,fontproperties=ITAL,fontsize=9,color=TXT,alpha=0.78,ha=ha,va='center',zorder=9)
note(3800,6.78,'drive')
note(4670,6.78,'premature touch')
note(4860,2.95,'the jump',ha='left')
note(5440,-0.45,'atrium and ventricle sound together · every 303 ms')
note(4020,-0.45,'arpeggio · 116 ms')
caption(f,'Ladder · Echo','Concept plate 1 · rendered from v0.1 engine events (Echo topology, fast-pathway ERP 300 ms, slow pathway 160 ms). Gold antegrade, blue retrograde; bars mark block; open rings are silent sites.',y=0.07)
f.savefig('plate1_ladder.png',facecolor=BG); print('ok')
