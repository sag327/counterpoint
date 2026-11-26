import json, math
from style import *
from matplotlib.colors import LinearSegmentedColormap
ev=json.load(open('ost_events.json'))
act=[e for e in ev if e['type']=='activation']
ref=[a['tMs'] for a in act if a['nodeId']=='R0'][-2]; CL=261
lat={}
for a in act:
    if a['nodeId'].startswith('R') and ref<=a['tMs']<ref+CL-1: lat[a['nodeId']]=a['tMs']-ref
cmap=LinearSegmentedColormap.from_list('cp',['#FFF1D1','#C8A878','#B9B2A4','#83A9C8','#4A6C8E'])
f=fig(12,7.4); ax=f.add_axes([0,0.13,1,0.87]); ax.set_facecolor(BG); ax.axis('off'); ax.set_xlim(-2.0,3.3); ax.set_ylim(-2.05,1.55); ax.set_aspect('equal')
cx,cy,R=-0.4,-0.1,1.15
ang={f'R{i}':-math.pi/2 + i*2*math.pi/10 for i in range(10)}
P={k:(cx+R*math.cos(v),cy+R*math.sin(v)) for k,v in ang.items()}
rng=np.random.default_rng(3)
for i in range(10):
    a,b=f'R{i}',f'R{(i+1)%10}'
    ta,tb=lat[a],lat[b] if lat[b]>lat[a] else lat[b]+CL
    th=np.linspace(ang[a],ang[a]+2*math.pi/10,80)
    for s in range(5):
        amp=rng.uniform(0.01,0.035); ph=rng.uniform(0,6.28); k=rng.integers(1,3)
        rr=R+amp*np.sin(k*np.linspace(0,math.pi,80)+ph)*np.sin(np.linspace(0,math.pi,80))
        x=cx+rr*np.cos(th); y=cy+rr*np.sin(th)
        tt=np.linspace(ta,tb,80)
        for j in range(79):
            c=cmap(((tt[j])%CL)/CL)
            ax.plot(x[j:j+2],y[j:j+2],color=c,lw=0.55 if s else 1.0,alpha=0.35 if s else 0.85,solid_capstyle='round',zorder=3)
for k,(x,y) in P.items():
    c=cmap(lat[k]/CL); pearl(ax,x,y,c,'#FFFFFF',s=46)
# seam mark between R9 and R0
a9,a0=ang['R9']+0.5*2*math.pi/10, ang['R0']
sa=(ang['R9']+2*math.pi/10+ang['R9'])/2
# label seam
mx=cx+(R+0.22)*math.cos(ang['R9']+0.32); my=cy+(R+0.22)*math.sin(ang['R9']+0.32)
ax.text(mx+0.05,my-0.05,'early meets late',fontproperties=ITAL,fontsize=9.5,color=TXT,alpha=0.75,ha='left',va='center')
# isthmus label
ia=(ang['R4']+ang['R5'])/2; ax.text(cx+(R+0.25)*math.cos(ia),cy+(R+0.25)*math.sin(ia),'isthmus',fontproperties=ITAL,fontsize=9.5,color=TXT,alpha=0.75,ha='center',va='center')
# branch: R0 (bottom) -> N1,N2,N3 -> H -> V drooping right
x0,y0=P['R0']
pts=[('N1',x0+0.55,y0-0.32),('N2',x0+1.05,y0-0.52),('N3',x0+1.55,y0-0.6),('H',x0+2.1,y0-0.52),('V',x0+2.75,y0-0.25)]
prev=(x0,y0)
for n,x,y in pts:
    xs=np.linspace(prev[0],x,40); ys=np.linspace(prev[1],y,40)+0.04*np.sin(np.linspace(0,math.pi,40))
    for s in range(3): ax.plot(xs,ys+0.008*s,color=GOLD,lw=0.6,alpha=0.45 if s else 0.8,zorder=2)
    prev=(x,y)
for n,x,y in pts:
    if n.startswith('N'): ax.scatter([x],[y],s=34,facecolor=BG,edgecolor=TXT,lw=0.9,alpha=0.8,zorder=8)
    else: pearl(ax,x,y,BLUE if n=='H' else GOLD,'#FFFFFF',s=46 if n=='V' else 30)
ax.text(pts[-1][1]+0.0,pts[-1][2]-0.25,'2 : 1',fontproperties=ITAL,fontsize=11,color=TXT,alpha=0.8,ha='center')
ax.text(pts[1][1],pts[1][2]-0.22,'silent nodal sites',fontproperties=ITAL,fontsize=8.5,color=TXT2,alpha=0.8,ha='center')
# listening catheter near R6/R7 area
lx,ly=cx+(R-0.38)*math.cos(ang['R3']+0.25),cy+(R-0.38)*math.sin(ang['R3']+0.25)
for r_,a_ in [(0.75,0.05),(0.52,0.08),(0.32,0.12),(0.17,0.2)]:
    ax.add_patch(matplotlib.patches.Circle((lx,ly),r_,fill=False,ec=BLUEC,lw=0.6,alpha=a_,zorder=2))
ax.add_patch(matplotlib.patches.Circle((lx,ly),0.055,fill=False,ec=BLUEC,lw=1.0,alpha=0.9,zorder=9))
ax.scatter([lx],[ly],s=5,color=BLUEC,zorder=10)
ax.plot([lx+0.06,lx+0.75],[ly-0.06,ly-0.55],color=BLUEC,lw=0.6,alpha=0.35,zorder=1)
ax.text(lx+0.8,ly-0.66,'listening point',fontproperties=ITAL,fontsize=9.5,color=TXT,alpha=0.75,ha='center')
# legend ramp
lx0,ly0,w=1.75,1.15,1.2
for j in range(120): ax.plot([lx0+w*j/120,lx0+w*(j+1)/120],[ly0,ly0],color=cmap(j/120),lw=3,solid_capstyle='butt')
ax.text(lx0,ly0+0.12,'earliest',fontproperties=SANS,fontsize=7.5,color=TXT2,ha='left'); ax.text(lx0+w,ly0+0.12,'latest',fontproperties=SANS,fontsize=7.5,color=TXT2,ha='right')
ax.text(lx0+w/2,ly0-0.16,f'one cycle · {CL} ms',fontproperties=SANS,fontsize=7.5,color=TXT2,ha='center')
caption(f,'Map · Ostinato','Concept plate 3 · activation-time overlay on the Network view, from a v0.1 engine run of a 10-site ring (24 ms links, 45 ms isthmus) feeding a silent nodal chain. The ventricle answers every second lap. Listening point shown with its field.',y=0.07)
f.savefig('plate3_map.png',facecolor=BG); print('ok')
