package com.ochafik.awt;
import java.awt.Button;
import java.awt.Component;
import java.awt.Container;
import java.awt.Dimension;
import java.awt.Insets;
import java.awt.Label;
import java.awt.LayoutManager;
import java.awt.LayoutManager2;
import java.awt.Panel;
import java.awt.TextField;
import java.io.Serializable;
import java.util.Hashtable;
import java.util.StringTokenizer;

// Referenced classes of package java.awt:
//            Dimension, LayoutManager, Component, Container, 
//            Insets

public class TableLayout
    implements //LayoutManager,
				LayoutManager2, 
				Serializable
{

    int hgap;
    int vgap;
    int rows;
    int cols;
	static final int FILL=0,
		E=1,
		W=2,
		N=3,
		S=4,
		NE=5,
		SE=6,
		NW=7,
		SW=8,
		CENTER=9,
		HC=10,
		HN=11,
		HS=12,
		VC=13,
		VW=14,
		VE=15;
			
    public TableLayout()
    {
        this(1, 0, 0, 0);
    }

    public TableLayout(int cols, int rows)
    {
        this(cols, rows, 0, 0);
    }

    public TableLayout(int cols, int rows, int hgap, int vgap)
    {
        if(cols == 0 && rows == 0)
        {
            throw new IllegalArgumentException("rows and cols cannot both be zero");
        } else
        {
            this.rows = rows;
            this.cols = cols;
            this.hgap = hgap;
            this.vgap = vgap;
            return;
        }
    }

    public int getRows()
    {
        return rows;
    }

    public void setRows(int i)
    {
        if(i == 0 && cols == 0)
        {
            throw new IllegalArgumentException("rows and cols cannot both be zero");
        } else
        {
            rows = i;
            return;
        }
    }

    public int getColumns()
    {
        return cols;
    }

    public void setColumns(int i)
    {
        if(i == 0 && rows == 0)
        {
            throw new IllegalArgumentException("rows and cols cannot both be zero");
        } else
        {
            cols = i;
            return;
        }
    }

    public int getHgap()
    {
        return hgap;
    }

    public void setHgap(int i)
    {
        hgap = i;
    }

    public int getVgap()
    {
        return vgap;
    }

    public void setVgap(int i)
    {
        vgap = i;
    }
	Hashtable constraintsMap=new Hashtable();
	void putConstaint(Component component,int disposition,boolean refuseXRemains,boolean refuseYRemains) {}
	
    public void addLayoutComponent(String constraintsString, Component component) {
	    	TableConstraints constraints=new TableConstraints();
		for (StringTokenizer stk=new StringTokenizer(constraintsString,",");stk.hasMoreTokens();) {
			String s=stk.nextToken().trim();
			
			if (s.equals("FILL")||s.equals("F")) constraints.setDisposition(FILL);
			else if (s.equals("N")) constraints.setDisposition(N);
			else if (s.equals("S")) constraints.setDisposition(S);
			else if (s.equals("E")) constraints.setDisposition(E);
			else if (s.equals("W")) constraints.setDisposition(W);
			else if (s.equals("NE")) constraints.setDisposition(NE);
			else if (s.equals("SE")) constraints.setDisposition(SE);
			else if (s.equals("NW")) constraints.setDisposition(NW);
			else if (s.equals("SW")) constraints.setDisposition(SW);
			else if (s.equals("C")||s.equals("CENTER")) constraints.setDisposition(CENTER);
			else if (s.equals("HC")||s.equals("H")) constraints.setDisposition(HC);
			else if (s.equals("HN")) constraints.setDisposition(HN);
			else if (s.equals("HS")) constraints.setDisposition(HS);
			else if (s.equals("VC")||s.equals("V")) constraints.setDisposition(VC);
			else if (s.equals("VW")) constraints.setDisposition(VW);
			else if (s.equals("VE")) constraints.setDisposition(VE);
			else if (s.equals("!X")) constraints.setRefuseXRemains(true);
			else if (s.equals("!Y")) constraints.setRefuseYRemains(true);
			else throw new IllegalArgumentException("Unknown space occupation type for TableLayout : '"+s+"'");
		}
		constraintsMap.put(component,constraints);
	}
    public void removeLayoutComponent(Component component) {}
	int prefRows[],prefCols[],minRows[],minCols[];	
	Dimension prefDims[],minDims[];
    public Dimension preferredLayoutSize(Container container) {
        Dimension dimension;
        synchronized(container.getTreeLock()) {
		Insets insets = container.getInsets();
		int nbComp = container.getComponentCount();
		prefRows=new int[rows];
		prefCols=new int[cols];
		prefDims=new Dimension[rows * cols];//nbComp];
		int w,h;
		for(int iComp=0;iComp<nbComp;iComp++) {
			Component component = container.getComponent(iComp);
			Dimension prefDim = (prefDims[iComp]=component.getPreferredSize());
			int i=iComp/cols,j=iComp%cols;
			w=prefDim.width;
			h=prefDim.height;
			if(prefCols[j] < w) prefCols[j]=w;
			if(prefRows[i] < h) prefRows[i]=h;
		}
		w=0; h=0;
		for (int j=0; j<cols;j++) w+=prefCols[j];
		for (int i=0; i<rows;i++) h+=prefRows[i];
		dimension = new Dimension(
		(insets==null ? 0 : insets.left) + (insets==null ? 0 : insets.right) + w + (cols - 1) * hgap, 
		(insets==null ? 0 : insets.top) + (insets==null ? 0 : insets.bottom) + h + (rows - 1) * vgap);
	}
	return dimension;
    }

    public Dimension minimumLayoutSize(Container container)
    {
        Dimension dimension;
        synchronized(container.getTreeLock()) {
	        
            Insets insets = container.getInsets();
            int nbComp = container.getComponentCount();
            minRows=new int[rows];
            minCols=new int[cols];
			minDims=new Dimension[nbComp];
			int w,h;
            for(int iComp=0;iComp<nbComp;iComp++) {
                Component component = container.getComponent(iComp);
                Dimension minDim = (minDims[iComp]=component.getMinimumSize());
				int i=iComp/cols,j=iComp%cols;
				w=minDim.width;
				h=minDim.height;
                if(minCols[j] < w) minCols[j]=w;
				if(minRows[i] < h) minRows[i]=h;
            }
			w=0; h=0;
			for (int i=0; i<cols;i++) w+=minCols[i];
			for (int j=0; j<rows;j++) h+=minRows[j];
            dimension = new Dimension(
				(insets==null ? 0 : insets.left) + (insets==null ? 0 : insets.right) + w + (cols - 1) * hgap, 
				(insets==null ? 0 : insets.top) + (insets==null ? 0 : insets.bottom) + h + (rows - 1) * vgap);
				//insets.left + insets.right + w + (cols - 1) * hgap, 
				//insets.top + insets.bottom + h + (rows - 1) * vgap);
        }
        return dimension;
    }
    public TableConstraints defaultTableConstraints=new TableConstraints(FILL,false,false);
    
    public void layoutContainer(Container container) {
	synchronized(container.getTreeLock()) {
		Dimension preferred=preferredLayoutSize(container),
		contDim=container.getSize(),
		minimum=minimumLayoutSize(container);
		Insets insets = container.getInsets();
		int nbComp = container.getComponentCount();
		int insh=insets==null ? 0 : (insets.top+insets.bottom),
			insw=insets==null ? 0 : (insets.left+insets.right);
		int contw = contDim.width-insw, 
			conth = contDim.height-insh;
		int pw=preferred.width-insw,
			ph=preferred.height-insh,
			mw=minimum.width-insw,
			mh=minimum.height-insh;
		
		// On prEpare le terrain en faisant un passage sur tous les composants et en rEcupErant les infos utiles dans des tableaux (propre mais lent)
		Component[][] componentsArray=new Component[cols][rows]; 
		TableConstraints[][] constraintsArray=new TableConstraints[cols][rows]; 
		boolean[] refuseXRemains=new boolean[cols], refuseYRemains=new boolean[rows];
		for(int iComp=0;iComp<nbComp;iComp++) {
			int j=iComp/cols, i=iComp%cols;
			Component component=container.getComponent(iComp);
			componentsArray[i][j] = component;
			TableConstraints constraints=(TableConstraints)(constraintsMap.get(component));
			constraintsArray[i][j] = constraints;
			refuseXRemains[i]=refuseXRemains[i]||(constraints!=null&&constraints.getRefuseXRemains());
			refuseYRemains[j]=refuseYRemains[j]||(constraints!=null&&constraints.getRefuseYRemains());
		}
		
		int colWidths[]=new int[cols],
			rowHeights[]=new int[rows],
			horizDecal[]=new int[cols],
			vertDecal[]=new int[rows];
		//System.out.println("=== X ===");
		layoutSizes(prefCols, pw, minCols, mw, contw, refuseXRemains, colWidths);
		//System.out.println("=== Y ===");
		layoutSizes(prefRows, ph, minRows, mh, conth, refuseYRemains, rowHeights);
				
		// posititionnement de chaque ligne/colonne
		int decal=vertDecal.length==0 ? 0 : (vertDecal[0]=insets==null ? 0 : insets.top);
		for (int i=1; i<rows;i++) 
			vertDecal[i]=(decal+=vgap+rowHeights[i-1]);
		decal=horizDecal.length==0 ? 0 : (horizDecal[0]=insets==null ? 0 : insets==null ? 0 : insets.left);
		for (int j=1; j<cols;j++) 
			horizDecal[j]=(decal+=hgap+colWidths[j-1]);

		// avertissement des composants des places et tailles qui leur on EtE assignEes
		for (int i=0; i<cols;i++) for (int j=0; j<rows; j++) {
			Component component=componentsArray[i][j];
			TableConstraints cons=constraintsArray[i][j];
			if (cons==null) cons=defaultTableConstraints;
			int disposition=cons.getDisposition();
			Dimension dimComp = prefDims[j*cols+i];
			if (dimComp == null)
				continue;
			
			int rowHeight=rowHeights[j],
				colWidth=colWidths[i];
			int compw=dimComp.width,
				comph=dimComp.height,
				x=0,y=0,w,h;
			w=compw<colWidth ? compw : colWidth;
			h=comph<rowHeight ? comph : rowHeight;
			switch (disposition) {
				case CENTER:
					x=(colWidth-w)/2;
					y=(rowHeight-h)/2;
					break;
				case FILL:
					w=colWidth;
					h=rowHeight;
					x=y=0;
					break;
				case HC:
					w=colWidth;
					x=0;
					y=(rowHeight-h)/2;
					break;
				case HN:
					w=colWidth;
					x=0;
					y=0;
					break;
				case HS:
					w=colWidth;
					x=0;
					y=rowHeight-h;
					break;
				case VC:
					h=rowHeight;
					y=0;
					y=(colWidth-w)/2;
					break;
				case VW:
					h=rowHeight;
					x=0;
					y=0;
					break;
				case VE:
					h=rowHeight;
					x=colWidth-w;
					y=0;
					break;
				case N:
					x=(colWidth-w)/2;
					y=0;
					break;
				case S:
					x=(colWidth-w)/2;
					y=rowHeight-h;
					break;
				case W:
					x=0;
					y=(rowHeight-h)/2;
					break;
				case E:
					x=colWidth-w;
					y=(rowHeight-h)/2;
					break;
				case NE:
					x=colWidth-w;
					y=0;
					break;
				case NW:
					x=0;
					y=0;
					break;
				case SE:
					x=colWidth-w;
					y=rowHeight-h;
					break;
				case SW:
					x=0;
					y=rowHeight-h;
					break;
			}
			component.setBounds(horizDecal[i]+x,vertDecal[j]+y,w,h);
		}
		minDims=null;
		prefDims=null;
		prefCols=null;
		prefRows=null;
		minCols=null;
		minRows=null;
        }
    }
    private static final void layoutSizes(int[] preferredSizes, int preferredTotal, int[] minimalSizes, int minimalTotal, int actualTotal, boolean[] refuseRemains, int[] sizesResult) {
	    int length=preferredSizes.length;
	    
	    int remainsAgreements=length;
	    int lastRemainsAgreement=0;
	    int remainsAgreeingPreferredTotal=0;
	    int remainsAgreeingDependingTotal=actualTotal;
	    for (int i=0;i<length;i++) { 
		    if (refuseRemains[i]) {
			    //System.out.println("Refusing "+i);
			    remainsAgreements++; 
			    remainsAgreeingDependingTotal-=preferredSizes[i]; // on ne tiendra pas compte de ce composant lors de la redistribution
		    } else {
			    lastRemainsAgreement=i;
			    remainsAgreeingPreferredTotal+=preferredSizes[i];
		    }
	    }
	    int amountToDistribute=actualTotal-preferredTotal;
	    //System.out.println("pref="+preferredTotal+",actual="+actualTotal+","+amountToDistribute+" to distribute");
	    //if (amountToDistribute>=0) {
		    int stillRemainingToDistribute=amountToDistribute;
		    
		    for (int i=0; i<length;i++) {
			    	int preferredSize=preferredSizes[i];
				if (refuseRemains[i]) sizesResult[i]=preferredSize;
				else { // distribution :
					int distributed= amountToDistribute==0 ? 
						0 : //rien à distribuer
						((i==lastRemainsAgreement) ? 
							stillRemainingToDistribute : // le dernier à accepter la distribution emporte tout 
								remainsAgreeingDependingTotal == 0 ? 0 : (preferredSize*amountToDistribute)/remainsAgreeingDependingTotal); // sinon, distribution proportionnelle
					stillRemainingToDistribute-=distributed;
					sizesResult[i]=preferredSize+distributed;
				}
			} 
	    //} else { // il faut revoir les espErances à la baisse... mais pas en deça des minima !
		    
	    //}
    }
    public String toString()
    {
        return getClass().getName() + "[hgap=" + hgap + ",vgap=" + vgap + ",rows=" + rows + ",cols=" + cols + "]";
    }
	public static void main2(String arg[]) {
		/*Frame f=new Frame("zgr");
		f.setLayout(new TableLayout(2,2));
		f.add(new Label("zrhzrhzrhzrhzrhzrhzrhzrh"),"E");
		f.add(new Button("Bout"));
		f.add(new TextArea(10,30),"FILL");
		f.pack();
		f.show();*/
		Panel pan=new Panel(new TableLayout(2,2));
		pan.add(new Label("Hello",Label.RIGHT),"W,!Y,!X");
		pan.add(new TextField(),"H");
		pan.add(new Label("World",Label.RIGHT),"W");
		pan.add(new Button("Haha"),"NE");
		
		OldAWTUtils.newExitingFrame("Test TableLayout",pan);
		
		OldAWTUtils.newExitingFrame("Test TableLayout",OldAWTUtils.newPanel(new Object[][] {
			{	new Object[] { new TextField(), "H" },
				new Object[] { new Button("HEhE"), "F"}
			},
			{	new Object[] { new Button("Haha"),"F" },
				new Label("Mamamia")
			}
		}));
	}
/*	public void addLayoutComponent(Component component, Object obj) {}

    public float getLayoutAlignmentX(Container container) {}

    public float getLayoutAlignmentY(Container container) {}

    public void invalidateLayout(Container container) {}

    public Dimension maximumLayoutSize(Container container) {}*/

	@Override
	public void addLayoutComponent(Component comp, Object constraints) {
		addLayoutComponent((String)constraints, comp);
	}

	@Override
	public float getLayoutAlignmentX(Container target) {
		// TODO Auto-generated method stub
		return 0;
	}

	@Override
	public float getLayoutAlignmentY(Container target) {
		// TODO Auto-generated method stub
		return 0;
	}

	@Override
	public void invalidateLayout(Container target) {
		// TODO Auto-generated method stub
		
	}

	@Override
	public Dimension maximumLayoutSize(Container target) {
		// TODO Auto-generated method stub
		return new Dimension(Integer.MAX_VALUE, Integer.MAX_VALUE);
	}
}
class TableConstraints {
	int disposition;
	boolean refuseXRemains;
	boolean refuseYRemains;
	public TableConstraints() {
	}
	public TableConstraints(int disposition, boolean refuseXRemains, boolean refuseYRemains) {
		this.disposition=disposition;
		this.refuseXRemains=refuseXRemains;
		this.refuseYRemains=refuseYRemains;
	}
	public void setDisposition(int disposition) {
		this.disposition = disposition;
	}
	public void setRefuseXRemains(boolean refuseXRemains) {
		//System.out.println("set x "+refuseXRemains);
		this.refuseXRemains = refuseXRemains;
	}
	public void setRefuseYRemains(boolean refuseYRemains) {
		//System.out.println("set y "+refuseYRemains);
		this.refuseYRemains = refuseYRemains;
	}
	public int getDisposition() {
		return disposition;
	}
	public boolean getRefuseXRemains() {
		//System.out.println("get x");
		return refuseXRemains;
	}
	public boolean getRefuseYRemains() {
		//System.out.println("get y");
		return refuseYRemains;
	}

}
