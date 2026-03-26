/*
 * Copyright (C) 2006-2011 by Olivier Chafik (http://ochafik.com)
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

package com.ochafik.math.bayes.display;

import java.awt.BorderLayout;
import java.awt.Component;
import java.awt.Point;
import java.awt.event.ActionEvent;
import java.awt.event.ComponentAdapter;
import java.awt.event.ComponentEvent;
import java.awt.event.KeyEvent;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.beans.BeanDescriptor;
import java.beans.BeanInfo;
import java.beans.Beans;
import java.beans.PropertyChangeEvent;
import java.beans.PropertyChangeListener;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.PrintWriter;
import java.net.URL;
import java.text.MessageFormat;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Random;

import javax.swing.AbstractAction;
import javax.swing.Action;
import javax.swing.BorderFactory;
import javax.swing.DefaultListCellRenderer;
import javax.swing.JComponent;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JList;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTabbedPane;
import javax.swing.JToolBar;
import javax.swing.KeyStroke;
import javax.swing.ListModel;
import javax.swing.UIManager;
import javax.swing.event.ListDataEvent;
import javax.swing.event.ListDataListener;
import javax.swing.event.ListSelectionEvent;
import javax.swing.event.ListSelectionListener;

import org.jdesktop.animation.timing.Animator;
import org.jdesktop.animation.transitions.ScreenTransition;
import org.jdesktop.animation.transitions.TransitionTarget;
import org.jdesktop.jxlayer.JXLayer;
import org.jdesktop.swingx.JXPanel;
import org.jdesktop.swingx.JXTaskPane;
import org.jdesktop.swingx.action.AbstractActionExt;

import com.ochafik.awt.TableLayout;
import com.ochafik.beans.BeansController;
import com.ochafik.beans.BeansUtils;
import com.ochafik.lang.SyntaxUtils;
import com.ochafik.math.bayes.BayesianNetwork;
import com.ochafik.math.bayes.BayesianNetworkHub;
import com.ochafik.math.bayes.XMLBIFReader;
import com.ochafik.math.bayes.XMLBIFWriter;
import com.ochafik.math.functions.FunctionException;
import com.ochafik.math.functions.Variable;
import com.ochafik.math.graph.view.GraphicComponent;
import com.ochafik.swing.JDialogs;
import com.ochafik.swing.SwingUtils;
import com.ochafik.util.SystemUtils;
import com.ochafik.util.listenable.Adapter;
import com.ochafik.util.listenable.ListenableCollections;
import com.ochafik.util.listenable.ListenableListModel;
import com.ochafik.util.string.StringUtils;

/**
 * /Users/ochafik/Prog/Java/simple2.xml
 * 
 * java -server -Xrunhprof:cpu=samples,doe=y,depth=15 -Xmx900m -cp classes/:libraries/trove.jar  ochafik.math.bayes.display.baya big70-1.xml
 */
public class Baya extends JPanel {

	static final String PROGRAM_TITLE = "Baya";
	
	public static void main(String[] args) {
		try {
		    try {
		    	UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
		    } catch (Exception e) { }
	
			URL url;
			if (args.length != 0) {
				url = new File(args[0]).toURI().toURL();
			} else {
				String baseExURL = "com/ochafik/math/bayes/";
				String[] exNames = new String[] {
						"Open File (XMLBIF 0.3)...",
						"alarm.xml",
						"car-starts.xml",
						"simple.xml",
						"dogproblem.xml",
						"elimbel2.xml",
						"example1.xml",
						"example2.xml",
				};
				int iOpen = 0, iDef = 3;//2;
				String exName = (String)JOptionPane.showInputDialog(null, "Please choose a bayesian network file", PROGRAM_TITLE, JOptionPane.QUESTION_MESSAGE, null, exNames, exNames[iDef]);
				if (exName == exNames[iOpen]) {
					File file = new File("/Users/ochafik/Prog/Java/resources/ochafik/math/bayes/car-starts.xml");
					if (!file.exists()) 
						file = new File(new File(System.getProperty("user.home")), "*.*");
					
					file = JDialogs.file(null, "Open Network", true, file);
					if (file == null) System.exit(1);
					url = file.toURI().toURL();
				} else {
					url = BayesianNetwork.class.getClassLoader().getResource(baseExURL+exName);
					if (url == null) {
						JOptionPane.showMessageDialog(null, "Failed to load file '"+exName+"' !", PROGRAM_TITLE, JOptionPane.ERROR_MESSAGE);
						System.exit(-1);
					}
				}
			}
			List<BayesianNetwork> nets = XMLBIFReader.read(url);
			
			//final LockableUI lockableUI = new LockableUI();      
			Baya baya = new Baya();
			baya.setNet(nets.iterator().next());

			JFrame frame = new JFrame(PROGRAM_TITLE);
			frame.getContentPane().add("Center", baya);
			frame.setSize(800, 600);
			frame.setVisible(true);

		} catch (Exception ex) {
			ex.printStackTrace();
		}
	}
	
	BayesianNetworkHub hub = new BayesianNetworkHub();
	BayesianNetworkDisplay display = new BayesianNetworkDisplay(hub);//lockableUI);
	

	public void setNet(BayesianNetwork net) throws FunctionException {
		net.infer();
		hub.setBayesianNet(net);
		
		observationsList.setModel(new ListenableListModel<Variable>(ListenableCollections.asList(net.getObservations().keySet())));
		variablesList.setModel(new ListenableListModel<Variable>(ListenableCollections.asList(net.getVariables())));

		display.getStickyDisplayVariables().addAll(net.getVariables());
	}
	
	JList observationsList, variablesList;
	AdvancedVariableTableEditor<Variable> variableTableEditor;
		
	static void enableIfNotNull(final Action action, Object bean, String propertyName) {
		enableConditionally(action, bean, propertyName, new Adapter<Object, Boolean>() {
			@Override
			public Boolean adapt(Object value) {
				return value != null;
			}
		});
	}
	static void enableConditionally(final Action action, Object bean, String propertyName, final Adapter<Object, Boolean> condition) {
		BeansUtils.addPropertyChangeListener(bean, propertyName, new PropertyChangeListener() {
			@Override
			public void propertyChange(PropertyChangeEvent evt) {
				action.setEnabled(condition.adapt(evt.getNewValue()));
			}
		});
		action.setEnabled(condition.adapt(BeansUtils.get(bean, propertyName)));
	}
	
	Action saveAction = new AbstractAction("save") {

		@Override
		public void actionPerformed(ActionEvent e) {
			BayesianNetwork net = hub.getBayesianNet();
			File file = (File)net.getAttribute("file");
			if (file == null) {
				String name = (String)net.getAttribute(BayesianNetwork.ATTRIB_NAME);
				if (name == null)
					name = "net";
				file = new File(
					JDialogs.fileInput(
						SyntaxUtils.as(e.getSource(), Component.class), 
						"Save", 
						"Please choose a file name", 
						new File(
							new File(System.getProperty("user.home")), 
							name + ".xml"
						).toString()
					)
				);
				if (file == null)
					return;
				
				net.setAttribute("file", file);
			}
			try {
				PrintWriter out = new PrintWriter(file);
				out.println(XMLBIFWriter.writeXML(net));
				out.close();
				
				SystemUtils.runSystemOpenDirectory(file.getParentFile());
			} catch (Exception e1) {
				JDialogs.error(SyntaxUtils.as(e.getSource(), Component.class), "Error", "Error while saving net", e1);
			}
			
		}
		
	};
	
	public Baya() {
		super(new BorderLayout());
		
		hub = new BayesianNetworkHub();
		display = new BayesianNetworkDisplay(hub);//lockableUI);
		
		enableIfNotNull(saveAction, hub, BayesianNetworkHub.PROPERTY_NET);
		
		//lockableUI.setLockedEffects(new BufferedImageOpEffect(new BlurFilter()));
		//final JXLayer<JComponent> layer = new JXLayer<JComponent>(topPanel, lockableUI);
		
		//JTabbedPane pane = new JTabbedPane();
		
		//pane.add("Bayesian Network", new JScrollPane(display.getVectorDisplay()));
		//displayPanel.setBorder(SwingUtils.getNativeLoweredBorder());
		//pane.add("Bayesian Network", new JScrollPane(display.getVectorDisplay()));
		//pane.setSelectedIndex(0);
		
		//GraphicComponent<Variable> layout = new GraphicComponent<Variable>(hub);
				//net.getGraph(), Arrays.asList(net.getGraph()));
		
		
		
		JToolBar toolbar = new JToolBar();
		toolbar.add(saveAction);
		toolbar.add(new AbstractAction("random") {
			Random random = new Random();
			
			@Override
			public void actionPerformed(ActionEvent e) {
				Animator animator = new Animator(500);
				//animator.setResolution(100);
				
				animator.setAcceleration(.2f); 
				animator.setDeceleration(.2f);
				new ScreenTransition(
					display.getVectorDisplay(), //definitionPanel, 
					new TransitionTarget() {
						@Override
						public void setupNextScreen() {
							for (Variable v : hub.getBayesianNet().getVariables()) {
								Point p = (Point)v.getProperty(BayesianNetwork.ATTRIB_POSITION);
								Point p2 = new Point(
									p.x + (int)((0.5 - random.nextDouble()) * 50), 
									p.y + (int)((0.5 - random.nextDouble()) * 50)
								);
								v.setProperty(BayesianNetwork.ATTRIB_POSITION, p2);
							}
						}
					}, 
					animator
				).start();
				
			}
			
		});
		add("North", toolbar);
		add("Center", new JScrollPane(display.getVectorDisplay()));
		
		variableTableEditor = new AdvancedVariableTableEditor<Variable>();
		variableTableEditor.setColorSchemes(display.getColorSchemes());
		final JXTaskPane definitionPanel = newTaskPane("Definition", variableTableEditor, true);
		//JXLayer definitionPanel = new JXLayer(variableTableEditor);
		/*definitionPanel.addComponentListener(new ComponentAdapter() {
			@Override
			public void componentShown(ComponentEvent e) {
				JLabel transpLab = new JLabel();
				transpLab.setOpaque(false);
				((JComponent)e.getComponent()).getRootPane().setGlassPane(transpLab);
			}
		});*/
		//JXPanel definitionPanel = new JXPanel(new BorderLayout());
		//definitionPanel.add("Center", variableTableEditor);
		add("South", definitionPanel);
		
		
		variablesList = new JList(new Object[0]);
		variablesList.addMouseListener(new MouseAdapter() {
			@Override
			public void mouseClicked(MouseEvent e) {
				if (e.getClickCount() == 2) {
					Variable variable = (Variable)((JList)e.getSource()).getSelectedValue();
					if (variable != null && definitionPanel.isCollapsed())
						definitionPanel.setCollapsed(false);
				}
			}
		});
		
		final Variable targetVariable[] = new Variable[1];
		
		Animator animator = new Animator(500);
		animator.setAcceleration(.2f); 
		animator.setDeceleration(.2f);
		final ScreenTransition transition = new ScreenTransition(
			this, //definitionPanel, 
			new TransitionTarget() {
				@Override
				public void setupNextScreen() {
					Variable variable = targetVariable[0];
					if (variable != null)
						variableTableEditor.setVariableTable(variable, hub.getBayesianNet().getDefinitions().get(variable));
					else
						variableTableEditor.setVariableTable(null, null);
				}
			}, 
			animator
		);
		
		variablesList.addListSelectionListener(new ListSelectionListener() {
			@Override
			public void valueChanged(ListSelectionEvent e) {
				Variable variable = (Variable)((JList)e.getSource()).getSelectedValue();
				targetVariable[0] = variable;
				transition.start();
			}
		});
		
		observationsList = new JList(new Object[0]);
		observationsList.setCellRenderer(new DefaultListCellRenderer() {
			@Override
			public Component getListCellRendererComponent(JList list, Object value, int index, boolean isSelected, boolean cellHasFocus) {
				Variable variable = (Variable)value;
				Collection<String> res = new ArrayList<String>();
				BayesianNetwork net = hub.getBayesianNet();
				if (net != null) {
					for (Map.Entry<Integer,Float> e : net.getObservations().get(variable).entrySet()) {
						float prob = e.getValue();
						if (prob == 0) continue;
						res.add(variable.getValues().get(e.getKey()) + " = " + prob);
					}
				}
				value = 
					"<html><body><b>" + 
						variable + 
						"</b><br><font size='-2'>" + 
							StringUtils.implode(res, ", ") +
						"</font>" +
					"</body></html>";
				
				net.getObservations().get(value);
				return super.getListCellRendererComponent(list, value, index, isSelected, cellHasFocus);
			}
		});
		String actionKey = "deleteItem";
		observationsList.getInputMap().put(KeyStroke.getKeyStroke(KeyEvent.VK_DELETE, 0), actionKey);
		observationsList.getInputMap().put(KeyStroke.getKeyStroke(KeyEvent.VK_BACK_SPACE, 0), actionKey);
		observationsList.getActionMap().put(actionKey, new AbstractAction() {
			public void actionPerformed(ActionEvent e) {
				JList list = (JList)e.getSource();
				ListenableListModel<?> model = (ListenableListModel<?>)list.getModel();
				Object[] sel = list.getSelectedValues();
				if (sel.length != 0) {
					for (Object s : sel) {
						model.getList().remove(s);
					}
					try {
						//display.setLocked(true);
						BayesianNetwork net = hub.getBayesianNet();
						if (net != null)
							net.infer();
					} catch (FunctionException e1) {
						e1.printStackTrace();
					} finally {
						//display.setLocked(false);
					}
				}
				
			}
		});
		
		///*
		JPanel p = new JPanel(new TableLayout(1,3));
		p.add(newListTaskPane("Variables ({0})", variablesList, true, true), "H, !Y");
		p.add(newListTaskPane("Observations ({0})", observationsList, true, false), "H, !Y");
		p.add(new javax.swing.JLabel(), "V");
		add("East", p);
	}
	

	static void updateTaskTitle(JXTaskPane tpane, MessageFormat format, Object... params) {
		tpane.setTitle(format.format(params, new StringBuffer(), null).toString());
	}
	static JPanel newListTaskPane(String titleFormat, final JList list, boolean scrollable, boolean collapsed) {
		final ListModel model = list.getModel();
		final MessageFormat format = new MessageFormat(titleFormat);
		
		final JXTaskPane tpane = new JXTaskPane();
		tpane.setAlignmentX(0);
		tpane.getContentPane().add("Center", scrollable ? new JScrollPane(list) : list);
		tpane.setCollapsed(collapsed);
		
		
		updateTaskTitle(tpane, format, model.getSize());
		final ListDataListener dataListener = new ListDataListener() {
			void upd() {
				ListModel model = list.getModel();
				updateTaskTitle(tpane, format, model == null ? 0 : model.getSize());
			}
			@Override
			public void contentsChanged(ListDataEvent e) {
				upd();
			}

			@Override
			public void intervalAdded(ListDataEvent e) {
				upd();
			}

			@Override
			public void intervalRemoved(ListDataEvent e) {
				upd();
			}
		};
		
		if (model != null)
			model.addListDataListener(dataListener);
		
		list.addPropertyChangeListener("model", new PropertyChangeListener() {
			@Override
			public void propertyChange(PropertyChangeEvent evt) {
				ListModel oldModel = (ListModel)evt.getOldValue(),
					model = (ListModel)evt.getNewValue();
				
				if (oldModel != null)
					oldModel.removeListDataListener(dataListener);
				if (model != null)
					model.addListDataListener(dataListener);
				
				updateTaskTitle(tpane, format, model == null ? 0 : model.getSize());
			}
		});
		
		JPanel p = new JPanel(new BorderLayout());
		int d = 5;
		p.setBorder(BorderFactory.createEmptyBorder(d,d,0,d));
		p.add("Center", tpane);
		return p;
	}
	static JXTaskPane newTaskPane(String title, JComponent content, boolean collapsed) {
		JXTaskPane tpane = new JXTaskPane();
		tpane.setTitle(title);
		tpane.setAlignmentX(0);
		//tpane.setPreferredSize(new Dimension(Integer.MAX_VALUE, -1));
		tpane.getContentPane().add("Center", content);
		tpane.setCollapsed(collapsed);
		return tpane;
	}
	
}
