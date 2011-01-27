/*
 * Copyright (C) 2011 by Olivier Chafik (http://ochafik.com)
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

package com.ochafik.awt;
import java.awt.Button;
import java.awt.Component;
import java.awt.Container;
import java.awt.Dimension;
import java.awt.Frame;
import java.awt.Insets;
import java.awt.Label;
import java.awt.LayoutManager;
import java.awt.TextArea;
import java.io.Serializable;
import java.util.Hashtable;

// Referenced classes of package java.awt:
//            Dimension, LayoutManager, Component, Container, 
//            Insets

public class OldTableLayout
    implements LayoutManager,
				//LayoutManager2, 
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
    /*public OldTableLayout()
    {
        this(1, 0, 0, 0);
    }*/

    public OldTableLayout(int i, int j)
    {
        this(i, j, 0, 0);
    }

    public OldTableLayout(int i, int j, int k, int l)
    {
        if(i == 0 && j == 0)
        {
            throw new IllegalArgumentException("rows and cols cannot both be zero");
        } else
        {
            rows = j;
            cols = i;
            hgap = k;
            vgap = l;
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
	Hashtable constraints=new Hashtable();
    public void addLayoutComponent(String s, Component component) {
		//System.out.println(s);
		if (s.equals("FILL")||s.equals("F")) constraints.put(component,new Integer(FILL));
		else if (s.equals("N")) constraints.put(component,new Integer(N));
		else if (s.equals("S")) constraints.put(component,new Integer(S));
		else if (s.equals("E")) constraints.put(component,new Integer(E));
		else if (s.equals("W")) constraints.put(component,new Integer(W));
		else if (s.equals("NE")) constraints.put(component,new Integer(NE));
		else if (s.equals("SE")) constraints.put(component,new Integer(SE));
		else if (s.equals("NW")) constraints.put(component,new Integer(NW));
		else if (s.equals("SW")) constraints.put(component,new Integer(SW));
		else if (s.equals("C")||s.equals("CENTER")) constraints.put(component,new Integer(CENTER));
		else if (s.equals("HC")||s.equals("H")) constraints.put(component,new Integer(HC));
		else if (s.equals("HN")) constraints.put(component,new Integer(HN));
		else if (s.equals("HS")) constraints.put(component,new Integer(HS));
		else if (s.equals("VC")||s.equals("V")) constraints.put(component,new Integer(VC));
		else if (s.equals("VW")) constraints.put(component,new Integer(VW));
		else if (s.equals("VE")) constraints.put(component,new Integer(VE));
		else throw new IllegalArgumentException("Unknown space occupation type for OldTableLayout : '"+s+"'");
	}
    public void removeLayoutComponent(Component component) {}
	int prefRows[],prefCols[],minRows[],minCols[];	
	Dimension prefDims[],minDims[];
    public Dimension preferredLayoutSize(Container container)
    {
        Dimension dimension;
        synchronized(container.getTreeLock()) {
            Insets insets = container.getInsets();
            int nbComp = container.getComponentCount();
            prefRows=new int[rows];
            prefCols=new int[cols];
			prefDims=new Dimension[nbComp];
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
			int colWidths[]=new int[cols],
				rowHeights[]=new int[rows],
				horizDecal[]=new int[cols],
				vertDecal[]=new int[rows];
			if (contw>=mw) {
				for (int j=0; j<cols;j++) {
					colWidths[j]=pw==0 ? 0 : (prefCols[j]*contw)/pw;
				}
			} else {
				for (int j=0; j<cols;j++)
					colWidths[j]=(minCols[j]*contw)/mw;
			}
			if (contw>=mw) {
				for (int i=0; i<rows;i++) {
					rowHeights[i]=ph==0 ? 0 : (prefRows[i]*conth)/ph;
				}
			} else {
				for (int i=0; i<rows;i++) 
					rowHeights[i]=mh==0 ? 0 : (minRows[i]*conth)/mh;
			}
			int decal=vertDecal.length==0 ? 0 : (vertDecal[0]=insets==null ? 0 : insets.top);
			for (int i=1; i<rows;i++) vertDecal[i]=(decal+=vgap+rowHeights[i-1]);
			decal=horizDecal.length==0 ? 0 : (horizDecal[0]=insets==null ? 0 : insets==null ? 0 : insets.left);
			for (int j=1; j<cols;j++) horizDecal[j]=(decal+=hgap+colWidths[j-1]);
						
    		for(int iComp=0;iComp<nbComp;iComp++) {
                Component component = container.getComponent(iComp);
                Dimension dimComp = prefDims[iComp];
				int i=iComp/cols, j=iComp%cols;
				int rowHeight=rowHeights[i],
					colWidth=colWidths[j];
				int compw=dimComp.width,
					comph=dimComp.height,
					x=0,y=0,w,h;
				w=compw<colWidth ? compw : colWidth;
				h=comph<rowHeight ? comph : rowHeight;
				Integer cons=(Integer)(constraints.get(component));
				int constraint=(cons==null ? CENTER : cons.intValue());
				switch (constraint) {
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
				container.getComponent(iComp).setBounds(horizDecal[j]+x,vertDecal[i]+y,w,h);
			}
			minDims=null;
			prefDims=null;
			prefCols=null;
			prefRows=null;
			minCols=null;
			minRows=null;
        }
    }
    public String toString()
    {
        return getClass().getName() + "[hgap=" + hgap + ",vgap=" + vgap + ",rows=" + rows + ",cols=" + cols + "]";
    }
	public static void mainTest(String arg[]) {
		Frame f=new Frame("zgr");
		f.setLayout(new OldTableLayout(2,2));
		f.add(new Label("zrhzrhzrhzrhzrhzrhzrhzrh"),"E");
		f.add(new Button("Bout"));
		f.add(new TextArea(10,30),"FILL");
		f.pack();
		f.show();
	}
/*	public void addLayoutComponent(Component component, Object obj) {}

    public float getLayoutAlignmentX(Container container) {}

    public float getLayoutAlignmentY(Container container) {}

    public void invalidateLayout(Container container) {}

    public Dimension maximumLayoutSize(Container container) {}*/
}
