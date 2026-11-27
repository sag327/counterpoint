import math, json
def avn(cl,n=300,ahmin=60,A=220,tau=110,erp=90):
    # recovery time R = A_n - H_{n-1}; block if R<erp; AH = ahmin + A*exp(-R/tau)
    H=-1e9; out=[]; hs=[]
    for k in range(n):
        a=k*cl; R=a-H
        if R<erp: out.append(None); continue
        ah=ahmin+A*math.exp(-R/tau); H=a+ah; hs.append(H); out.append(ah)
    return out,hs
res={}
for cl in [600,500,450,420,400,380,360,340,320,300]:
    o,h=avn(cl); tail=o[-12:]
    cond=sum(1 for x in o[100:] if x is not None)/len(o[100:])
    print(cl,round(cond,3),[None if x is None else round(x) for x in tail])
print('---')
for cl in [600,500,450,420,400,380,360,340,320,300,280,260]:
    o,h=avn(cl,ahmin=60,A=300,tau=120,erp=170); tail=o[-14:]
    cond=sum(1 for x in o[100:] if x is not None)/len(o[100:])
    print(cl,round(cond,3),' '.join('·' if x is None else str(round(x)) for x in tail))
