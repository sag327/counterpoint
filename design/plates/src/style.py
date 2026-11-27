import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
import numpy as np
F='/home/claude/fonts/ttf/'
for f in ['eb-garamond-latin-400-normal','eb-garamond-latin-400-italic','eb-garamond-latin-500-normal','inter-latin-300-normal','inter-latin-400-normal','inter-latin-500-normal']:
    fm.fontManager.addfont(F+f+'.ttf')
SERIF=fm.FontProperties(fname=F+'eb-garamond-latin-400-normal.ttf')
ITAL=fm.FontProperties(fname=F+'eb-garamond-latin-400-italic.ttf')
SANS=fm.FontProperties(fname=F+'inter-latin-300-normal.ttf')
SANS4=fm.FontProperties(fname=F+'inter-latin-400-normal.ttf')
BG='#070B12'; DEEP='#111D2B'; GOLD='#C8A878'; GOLDC='#FFF1D1'; BLUE='#83A9C8'; BLUEC='#D9F1FF'
TXT='#E3DED5'; TXT2='#9CA9B8'; RULE='#1B2736'
def spaced(s,n=1): return (' '*n).join(s)
def fig(w,h,dpi=200):
    f=plt.figure(figsize=(w,h),dpi=dpi,facecolor=BG)
    return f
def glowline(ax,x,y,color,core,lw=1.0,alpha=1.0,z=3,ls='-'):
    for k,a in [(7,0.03),(4.5,0.06),(2.6,0.12)]:
        ax.plot(x,y,color=color,lw=lw*k,alpha=a*alpha,solid_capstyle='round',zorder=z,ls=ls)
    ax.plot(x,y,color=color,lw=lw,alpha=0.95*alpha,solid_capstyle='round',zorder=z+1,ls=ls)
def pearl(ax,x,y,color,core,s=26,z=6,glow=1.0):
    for k,a in [(16,0.025),(9,0.05),(4.5,0.10)]:
        ax.scatter([x],[y],s=s*k,color=color,alpha=a*glow,lw=0,zorder=z)
    ax.scatter([x],[y],s=s,color=color,lw=0,zorder=z+1)
    ax.scatter([x-0.0],[y],s=s*0.35,color=core,lw=0,zorder=z+2,alpha=0.95)
def caption(f,title,sub,y=0.06):
    f.text(0.5,y+0.035,spaced(title),fontproperties=ITAL,fontsize=15,color=TXT,ha='center',va='center')
    f.text(0.5,y,sub,fontproperties=SANS,fontsize=7.2,color=TXT2,ha='center',va='center')
