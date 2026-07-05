import Layers from '$lib/components/icon/Layers.svelte';
import Flag from '$lib/components/icon/Flag.svelte';
import Sigma from '$lib/components/icon/Sigma.svelte';
import Grid from '$lib/components/icon/Grid.svelte';
import Flask from '$lib/components/icon/Flask.svelte';
import Scatter from '$lib/components/icon/Scatter.svelte';
import Split from '$lib/components/icon/Split.svelte';
import Tornado from '$lib/components/icon/Tornado.svelte';
import Compare from '$lib/components/icon/Compare.svelte';
import Target from '$lib/components/icon/Target.svelte';
import TrendingUp from '$lib/components/icon/TrendingUp.svelte';
import Dice from '$lib/components/icon/Dice.svelte';
import Coins from '$lib/components/icon/Coins.svelte';
import Database from '$lib/components/icon/Database.svelte';
import Plug from '$lib/components/icon/Plug.svelte';

export const dashboard =  [
	{
		key: 'works',
		label : '業務',
		items: [
			{ title: 'レポート作成', desc: '相関分析・回帰分析・記述統計・分類・A/Bテストから選んだ手法を実行し、結果を踏まえたレポートを作成します。', href: '/report-create', icon: Layers },
			{ title: 'KPI管理', desc: '目的変数の目標値から、KPI候補（説明変数）の目標値を実測レンジ内に収まる形で逆算し、KPIプランとして管理します。', href: '/kpi', icon: Flag },
		]
	},
	{
		key: 'analysis',
		label : '分析',
		items: [
			{ title: '記述統計', desc: '選択した列の平均・中央値・標準偏差・四分位数とヒストグラムを見ます。データの分布や外れ値をまず把握したいときに使います。', href: '/analysis/descriptive-stats', icon: Sigma },
			{ title: '相関分析', desc: '選択した列どうしのピアソン相関係数をヒートマップで見ます。「どの変数とどの変数が関係していそうか」を、回帰分析の前に探索的に把握したいときに使います。', href: '/analysis/correlation', icon: Grid },
			{ title: 'A/Bテスト・有意差検定', desc: '2つのグループ間で指標に統計的な有意差があるかを検定します（平均はt検定、比率はz検定）。「施策Aと施策Bでどちらが良いと言えるか」を確かめたいときに使います。', href: '/analysis/ab-test', icon: Flask },
			{ title: '回帰分析', desc: '説明変数を動かすと目的変数がどう変化するかをシミュレーションします。「広告費を増やしたら売上はどうなるか」のような、ドライバーの影響度を調べたいときに使います。', href: '/analysis/regression', icon: Scatter },
			{ title: 'ロジスティック回帰・分類', desc: '目的変数が2値（購入した/しない等）の場合に、説明変数からその確率を予測するモデルを作ります。「どんな顧客が購入・解約しやすいか」を知りたいときに使います。', href: '/analysis/classification', icon: Split },
			{ title: '感度分析', desc: '各説明変数を実測レンジいっぱいに動かした時、目的変数がどれだけ振れるかをトルネードチャートで見ます。「一番効いている変数はどれか」を最初に把握したいときに使います。', href: '/analysis/sensitivity', icon: Tornado },
			{ title: 'シナリオ比較', desc: '説明変数の組み合わせを複数パターン用意し、目的変数の予測値を横並びで比較します。「楽観ケースと悲観ケースでどれだけ差が出るか」を見たいときに使います。', href: '/analysis/scenario', icon: Compare },
			{ title: 'ゴールシーク', desc: '目的変数を目標値にするために、説明変数がいくつであるべきかを逆算します。「売上目標を達成するには広告費をいくらにすべきか」を知りたいときに使います。', href: '/analysis/goal-seek', icon: Target },
			{ title: 'トレンド予測', desc: '時系列データから将来の推移を線で予測します。「半年後・1年後・5年後の見込み」のような、時間の経過に沿った推移を見たいときに使います。', href: '/analysis/trend', icon: TrendingUp },
			{ title: 'モンテカルロ・シミュレーション', desc: '説明変数に幅（分布）を持たせて大量にサンプリングし、目的変数がとりうる値のばらつきを見ます。「どのくらいの確率で目標を超えるか」のような不確実性を織り込みたいときに使います。', href: '/analysis/monte-carlo', icon: Dice },
			{ title: '予算配分最適化', desc: '説明変数を予算配分するチャネル（広告費等）とみなし、予算総額を目的変数が最大になるよう配分します。「限られた予算をどのチャネルにいくら振るべきか」を知りたいときに使います。', href: '/analysis/budget-allocation', icon: Coins },
		]
	},
	{
		key: 'data-source',
		label : 'データソース',
		items: [
			{ title: 'データベース管理', desc: '作成したデータベースや外部から取り込んだデータベースのテーブル情報やデータの管理を行います。', href: '/database', icon: Database },
			{ title: 'データ連携', desc: '外部のデータベースやデータベースサービスとの接続管理を行います。', href: '/connections', icon: Plug },
		]
	}
];
