package com.ochafik.math.graph;

import com.ochafik.math.graph.impl.FastDenseIntEdgeSet;
import com.ochafik.math.graph.impl.FastDenseValuedEdgeSet;
import com.ochafik.math.graph.impl.FastSparseBinaryEdgeSet;
import com.ochafik.util.IntArray;
import com.ochafik.util.IntArrayUtils;
import com.ochafik.util.IntPairSet;
import com.ochafik.util.ShellOutput;

public class ConnectivityUtils {
	public static final BinaryEdgeSet computeGlobalConnectivity(final EdgeSet localConnectivity) {
		final BinaryEdgeSet globalConnectivity = new FastSparseBinaryEdgeSet(localConnectivity.isOriented());
		//final BinaryEdgeSet globalConnectivity = new DefaultBinaryEdgeSet(localConnectivity.isOriented());
		localConnectivity.export(new IntPairSet.IntPairOutput() {
			public void output(int x, int y) {
				updateGlobalConnectivityWithNewEdge(globalConnectivity, x, y);
			}
		});

		return globalConnectivity;
	}

	public static final void updateGlobalConnectivityWithNewEdge(BinaryEdgeSet globalConnectivity, int x, int y) {
		IntArray ancestors = globalConnectivity.getStarts(x), descendents = globalConnectivity.getEnds(y);
		globalConnectivity.set(ancestors, descendents);
		globalConnectivity.set(ancestors, IntArrayUtils.wrap(y));
		globalConnectivity.set(IntArrayUtils.wrap(x), descendents);
		globalConnectivity.set(x, y);
	}
	public static final void updatePathLengthGlobalConnectivityWithNewEdge(IntEdgeSet  globalConnectivity, int x, int y) {
		int[] arrayInt1 = new int[1];
		
		IntArray starts = globalConnectivity.getStarts(x), ends = globalConnectivity.getEnds(y);
		for (int iStart = starts.size(); iStart-- != 0;) {
			int start = starts.get(iStart);
			
			int startPathLength = globalConnectivity.get(start, x, arrayInt1) ? arrayInt1[0] : 0;

			for (int iEnd = ends.size(); iEnd-- != 0;) {
				int end = ends.get(iEnd);
				//len = globalConnectivity.get(y, end);
				int endPathLength = globalConnectivity.get(y, end);//len == null ? 0 : len.intValue();

				int combinedLength = startPathLength + 1 + endPathLength;
				if (!globalConnectivity.get(start, end, arrayInt1) || combinedLength < arrayInt1[0]) {
					globalConnectivity.set(start, end, combinedLength);
				}
			}

			int combinedLength = startPathLength + 1;
			if (!globalConnectivity.get(start, y, arrayInt1) || combinedLength < arrayInt1[0]) {
				globalConnectivity.set(start, y, combinedLength);
			}

		}

		for (int iEnd = ends.size(); iEnd-- != 0;) {
			int end = ends.get(iEnd);
			//Integer len = globalConnectivity.get(y, end);
			int endPathLength = globalConnectivity.get(y, end);//len == null ? 0 : len.intValue();

			int combinedLength = 1 + endPathLength;
			if (!globalConnectivity.get(x, end, arrayInt1) || combinedLength < arrayInt1[0]) {
				globalConnectivity.set(x, end, combinedLength);
			}
		}

		globalConnectivity.set(x, y, 1);

	}
	public static final IntEdgeSet computePathLengthGlobalConnectivity(final EdgeSet localConnectivity, int nodeCount) {
		final IntEdgeSet globalConnectivity = new FastDenseIntEdgeSet(localConnectivity.isOriented(), nodeCount);
		final ShellOutput.ShellLabel lab = new ShellOutput.ShellLabel("");
		final int total = localConnectivity.size();
		final int n[] = new int[] {0};
		long startTime = System.nanoTime();
		localConnectivity.export(new IntPairSet.IntPairOutput() {
			public void output(int x, int y) {
				updatePathLengthGlobalConnectivityWithNewEdge(globalConnectivity, x, y);
				if ((n[0] & 63) == 0) lab.setText(n[0]+" / "+total);
				n[0]++;
			}
		});
		lab.setText("");
		long endTime = System.nanoTime();
		lab.setText(((endTime - startTime) / 1000000) + " ms (" + (((endTime - startTime) / 100000 / n[0]) / 10.0) + " ms each)");
		ShellOutput.newline();
		return globalConnectivity;
	}
}
