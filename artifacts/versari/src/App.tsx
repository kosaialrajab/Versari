import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check,
  CheckCircle2, ChevronDown, CircleHelp, Clock3, Compass, GraduationCap, Heart, MapPin,
  Menu, MessageCircle, Plus, Search, SlidersHorizontal, Sparkles, Users, Video, X,
} from 'lucide-react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import { JaaSMeeting } from '@jitsi/react-sdk';
import { campusFromVerifiedEmails } from '@/lib/campus';
import {
  getGetDashboardSummaryQueryKey, getGetMyProfileQueryKey, getListActivityRequestsQueryKey,
  getListConnectionsQueryKey, getListMeetupsQueryKey, getListStudentsQueryKey,
  useCreateActivityRequest, useCreateConnection, useCreateMeetup, useCreateMeetupCallToken, useCancelMeetup,
  useGetDashboardSummary, useGetMyProfile, useJoinMeetup, useLeaveMeetup,
  useListActivityRequests, useListConnections, useListMeetups, useListStudents,
  useSaveMyProfile, useUpdateActivityRequest, useUpdateConnection,
} from '@workspace/api-client-react';
import type { ActivityRequest, Connection, ListMeetupsParams, ListStudentsParams, Meetup, MeetupInput, ProfileInput, StudentProfile } from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const appearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: 'bottom' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  variables: {
    colorPrimary: '#293449',
    colorForeground: '#293449',
    colorMutedForeground: '#727783',
    colorDanger: '#bd4935',
    colorBackground: '#fbf8f0',
    colorInput: '#fffdf8',
    colorInputForeground: '#293449',
    colorNeutral: '#293449',
    fontFamily: 'DM Sans',
    borderRadius: '1rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbf8f0] rounded-[24px] w-[440px] max-w-full overflow-hidden shadow-[0_22px_70px_rgba(41,52,73,.12)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#293449] font-semibold',
    headerSubtitle: 'text-[#727783]',
    socialButtonsBlockButtonText: 'text-[#293449] font-semibold',
    formFieldLabel: 'text-[#293449] font-medium',
    footerActionLink: 'text-[#c8553d] font-semibold',
    footerActionText: 'text-[#727783]',
    dividerText: 'text-[#727783]',
    identityPreviewEditButton: 'text-[#c8553d]',
    formFieldSuccessText: 'text-[#3d745e]',
    alertText: 'text-[#293449]',
    logoBox: 'mb-2',
    logoImage: 'h-9',
    socialButtonsBlockButton: 'border-[#ded8c9] bg-[#fffdf8] rounded-xl',
    formButtonPrimary: 'bg-[#293449] hover:bg-[#3b4961] rounded-xl',
    formFieldInput: 'border-[#ded8c9] bg-[#fffdf8] rounded-xl text-[#293449]',
    footerAction: 'border-t border-[#e7e0d3]',
    dividerLine: 'bg-[#ded8c9]',
    alert: 'rounded-xl',
    otpCodeFieldInput: 'rounded-xl border-[#ded8c9]',
    formFieldRow: 'gap-2',
    main: 'gap-5',
  },
};

function Wordmark({ dark = false }: { dark?: boolean }) {
  return <span className={`wordmark ${dark ? 'wordmark-light' : ''}`}><span className="wordmark-mark">v</span>versari</span>;
}

function SignInPage() {
  return <AuthPage><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></AuthPage>;
}

function SignUpPage() {
  return <AuthPage><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></AuthPage>;
}

function AuthPage({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page grain">
      <div className="auth-side">
        <Link href="/" className="auth-brand"><Wordmark dark /></Link>
        <div className="auth-note">
          <span className="eyebrow light-eyebrow">YOUR PEOPLE, YOUR CAMPUS</span>
          <h1 className="display">Good things<br />happen <em>together.</em></h1>
          <p>Find your study rhythm. Meet your next favorite people. It starts right here.</p>
          <div className="auth-doodle"><span>study pals</span><ArrowDownRight size={19} /></div>
        </div>
        <span className="auth-footer">A little closer to belonging.</span>
      </div>
      <div className="auth-form-wrap">
        <Link href="/" className="auth-mobile-brand"><Wordmark /></Link>
        {children}
        <p className="auth-verify"><CheckCircle2 size={15} /> Use a verified Carleton or uOttawa student email to join your campus community.</p>
      </div>
    </main>
  );
}

function Landing() {
  const { isSignedIn } = useAuth();
  if (isSignedIn) return <Redirect to="/discover" />;
  return (
    <div className="landing grain">
      <header className="landing-nav">
        <Link href="/" className="brand-link"><Wordmark /></Link>
        <nav className="landing-links" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#good-company">Good company</a>
        </nav>
        <div className="nav-actions">
          <Link href="/sign-in" className="nav-sign-in">Sign in</Link>
          <Link href="/sign-up" className="button button-dark">Find your people <ArrowRight size={16} /></Link>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow"><span className="eyebrow-dot" /> CAMPUS LIFE, BETTER TOGETHER</span>
            <h1 className="display">Your next<br />good thing is<br /><em>one hello away.</em></h1>
            <p className="hero-lede">A reliable study partner. Someone up for a walk. People who just get your campus. Find your kind of company with Versari.</p>
            <div className="hero-ctas">
              <Link href="/sign-up" className="button button-coral">Meet your people <ArrowRight size={17} /></Link>
              <Link href="/sign-in" className="quiet-link">Already a member? Sign in</Link>
            </div>
            <div className="hero-proof">
              <div className="avatar-stack"><span>AJ</span><span>MK</span><span>TS</span><span>+3</span></div>
              <span>Better days start with a familiar face.</span>
            </div>
          </div>
          <div className="hero-art" aria-label="Illustration of students sharing a study table">
            <div className="art-sun" />
            <div className="art-note note-one">you bring<br />the notes</div>
            <div className="art-note note-two">I'll bring<br />the snacks</div>
            <div className="art-table">
              <div className="table-paper"><span className="paper-line" /><span className="paper-line short" /><span className="paper-mark">good<br />ideas</span></div>
              <div className="table-book"><BookOpen size={36} strokeWidth={1.35} /></div>
            </div>
            <div className="art-person person-one"><div className="head" /><div className="body" /></div>
            <div className="art-person person-two"><div className="head" /><div className="body" /></div>
            <Sparkles className="art-flower" size={43} strokeWidth={1.4} />
            <span className="art-caption">A table with room for one more.</span>
          </div>
          <div className="hero-side-label mono">GOOD COMPANY / VOL. 01</div>
        </section>
        <section className="ticker" aria-label="Versari community">
          <div>STUDY TOGETHER <span>·</span> TRY ACTIVITIES <span>·</span> FIND YOUR PEOPLE <span>·</span> MAKE CAMPUS YOURS <span>·</span></div>
        </section>
        <section className="how-section" id="how-it-works">
          <div className="section-intro">
            <span className="eyebrow">LESS SCROLLING, MORE SHOWING UP</span>
            <h2 className="display">A campus full<br />of <em>almost-friends.</em></h2>
            <p>It can feel like everyone already has their people. They don't. Versari makes the first hello feel a little easier.</p>
          </div>
          <div className="steps">
            <article className="step-card"><span className="step-index mono">01 / SAY HELLO</span><div className="step-icon"><Users size={23} /></div><h3>Meet students like you</h3><p>Find people who share your course, your interests, or your very specific love of color-coded notes.</p><ArrowUpRight className="step-arrow" size={20} /></article>
            <article className="step-card step-featured"><span className="step-index mono">02 / MAKE A PLAN</span><div className="step-icon"><CalendarDays size={23} /></div><h3>Turn “we should” into “when”</h3><p>Join a low-key meetup or start one yourself. Library table, casual game, coffee and a walk — your call.</p><ArrowUpRight className="step-arrow" size={20} /></article>
            <article className="step-card"><span className="step-index mono">03 / FIND YOUR FLOW</span><div className="step-icon"><Heart size={23} /></div><h3>Build your kind of community</h3><p>Good study sessions and even better friendships start with a little common ground.</p><ArrowUpRight className="step-arrow" size={20} /></article>
          </div>
        </section>
        <section className="quote-section" id="good-company">
          <div className="quote-mark">“</div>
          <blockquote className="display">It’s not a networking thing.<br />It’s a <em>let’s-go-get-lunch</em> thing.</blockquote>
          <div className="quote-bottom"><span className="quote-rule" /><span>FOR THE IN-BETWEEN MOMENTS</span><span className="quote-rule" /></div>
          <div className="quote-stamp"><Sparkles size={19} /><span>MADE FOR<br />CAMPUS LIFE</span></div>
        </section>
        <section className="last-call">
          <div className="last-call-mark"><GraduationCap size={25} /></div>
          <span className="eyebrow">THE CAMPUS FEELS SMALLER ALREADY</span>
          <h2 className="display">There’s room<br />for <em>you here.</em></h2>
          <p>Make your profile, find your people, and see what happens when campus life feels a little more connected.</p>
          <Link href="/sign-up" className="button button-dark">Join the community <ArrowRight size={17} /></Link>
          <div className="last-call-scribble">see you around <ArrowDownRight size={22} /></div>
        </section>
      </main>
      <footer className="landing-footer"><Link href="/" className="brand-link"><Wordmark /></Link><span>Good company, close to home.</span><Link href="/sign-in" className="footer-sign-in">Member sign in <ArrowRight size={14} /></Link></footer>
    </div>
  );
}

function AppFrame({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useUser();
  const campus = campusFromVerifiedEmails(user?.emailAddresses);
  const { signOut } = useClerk();
  const [location] = useLocation();
  const links = [
    { href: '/discover', text: 'Discover', icon: Compass },
    { href: '/meetups', text: 'Meetups', icon: CalendarDays },
    { href: '/connections', text: 'Connections', icon: MessageCircle },
  ];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <Link href="/discover" className="sidebar-brand"><Wordmark dark /></Link>
        <div className="sidebar-campus"><span className="campus-dot" />{campus?.toUpperCase() || 'CAMPUS COMMUNITY'}</div>
        <nav className="side-nav" aria-label="Member navigation">
          {links.map(({ href, text, icon: Icon }) => <Link key={href} href={href} className={`side-link ${location === href ? 'active' : ''}`} onClick={() => setMobileOpen(false)}><Icon size={19} /><span>{text}</span>{href === '/connections' && <span className="side-chevron"><ArrowRight size={14} /></span>}</Link>)}
        </nav>
        <div className="sidebar-prompt"><div className="prompt-icon"><CircleHelp size={17} /></div><strong>New around here?</strong><p>A little hello can turn into a whole lot.</p><Link href="/discover">Start exploring <ArrowRight size={13} /></Link></div>
        <div className="sidebar-bottom">
          <Link href="/profile" className={`profile-mini ${location === '/profile' ? 'profile-mini-active' : ''}`}><div className="initial-avatar">{initials(user?.fullName || user?.firstName || 'You')}</div><span><strong>{user?.firstName || 'Your profile'}</strong><small>View your profile</small></span><ChevronDown size={15} /></Link>
          <button className="signout-link" onClick={() => signOut({ redirectUrl: basePath || '/' })}>Sign out</button>
        </div>
      </aside>
      {mobileOpen && <button aria-label="Close navigation" className="mobile-scrim" onClick={() => setMobileOpen(false)} />}
      <div className="app-main">
        <header className="mobile-topbar">
          <button className="icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={22} /></button>
          <Link href="/discover"><Wordmark /></Link>
          <Link href="/profile" className="initial-avatar mobile-avatar">{initials(user?.fullName || user?.firstName || 'You')}</Link>
        </header>
        <div className="app-content page-enter">{children}</div>
        <footer className="app-foot"><span>Versari · good company, close to campus.</span><Link href="/profile">Your profile <ArrowRight size={13} /></Link></footer>
      </div>
    </div>
  );
}

function MemberGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const campus = campusFromVerifiedEmails(user?.emailAddresses);
  const { data: profile, isLoading, isError, error, refetch } = useGetMyProfile({ query: { enabled: isLoaded && userLoaded && !!isSignedIn && !!campus, queryKey: getGetMyProfileQueryKey() } });
  const [location] = useLocation();
  if (!isLoaded || (isSignedIn && !userLoaded)) return <PageLoading />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (!campus || hasHttpStatus(error, 403)) return <CampusAccessDenied />;
  if (isLoading) return <PageLoading />;
  if (isError) return <main className="center-state"><div className="state-illustration"><CircleHelp size={27} /></div><h2 className="display">We couldn't load your profile.</h2><p>Give it another try in a moment.</p><button className="button button-dark" onClick={() => refetch()}>Try again</button></main>;
  if (!profile && location !== '/profile') return <Redirect to="/profile" />;
  return <AppFrame>{children}</AppFrame>;
}

function hasHttpStatus(error: unknown, status: number) {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === status;
}

function CampusAccessDenied() {
  const { signOut } = useClerk();
  return <main className="campus-access-page grain">
    <Link href="/" className="auth-brand"><Wordmark /></Link>
    <section className="center-state">
      <div className="state-illustration"><GraduationCap size={27} /></div>
      <span className="eyebrow">VERIFIED STUDENT EMAIL REQUIRED</span>
      <h1 className="display">Your campus community is private.</h1>
      <p>Versari is currently for students with a verified Carleton or uOttawa email. Sign in with your university address to continue.</p>
      <button className="button button-dark" onClick={() => signOut({ redirectUrl: `${basePath}/` })}>Sign out</button>
    </section>
  </main>;
}

function PageLoading() {
  return <main className="loading-page" aria-label="Loading"><div className="loading-header skeleton" /><div className="loading-line skeleton" /><div className="loading-grid"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div></main>;
}

function PageHeader({ kicker, title, desc, action }: { kicker: string; title: ReactNode; desc: string; action?: ReactNode }) {
  return <div className="page-header"><div><span className="eyebrow">{kicker}</span><h1 className="display">{title}</h1><p>{desc}</p></div>{action && <div className="page-header-action">{action}</div>}</div>;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') || 'V';
}

function DiscoverPage() {
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('');
  const [notice, setNotice] = useState('');
  const params = useMemo<ListStudentsParams>(() => ({ q: search.trim() || undefined, mode: mode ? mode as 'study' | 'play' : undefined }), [search, mode]);
  const studentsQuery = useListStudents(params, { query: { queryKey: getListStudentsQueryKey(params) } });
  const summaryQuery = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const requestConnection = useCreateConnection();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const students = studentsQuery.data || [];
  const onConnect = (student: StudentProfile) => requestConnection.mutate({ data: { recipientId: student.userId } }, {
    onSuccess: async () => {
      setNotice(`A hello is on its way to ${student.displayName.split(' ')[0]}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListStudentsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListConnectionsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
      ]);
    },
    onError: () => setNotice('That request did not go through. Please try again.'),
  });
  return (
    <div>
      <PageHeader kicker="YOUR CAMPUS, A LITTLE CLOSER" title={<>Find your <em>people.</em></>} desc="People to study with, try new activities with, or just make a Tuesday feel less Tuesday." action={<div className="campus-count"><Users size={17} /><strong>{summaryQuery.data?.studentCount ?? '—'}</strong><span>students here</span></div>} />
      <section className="discover-panel">
        <div className="discover-toolbar">
          <label className="search-box"><Search size={19} /><span className="sr-only">Search student profiles</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, course, or interest" data-testid="input-student-search" /></label>
          <div className="filter-label"><SlidersHorizontal size={16} /><span>Looking for</span></div>
          <div className="filter-pills" role="group" aria-label="Filter students by activity">
            <button className={`filter-pill ${!mode ? 'selected' : ''}`} onClick={() => setMode('')} data-testid="filter-all">Everyone</button>
            <button className={`filter-pill ${mode === 'study' ? 'selected' : ''}`} onClick={() => setMode(mode === 'study' ? '' : 'study')} data-testid="filter-study"><BookOpen size={14} /> Study</button>
            <button className={`filter-pill ${mode === 'play' ? 'selected' : ''}`} onClick={() => setMode(mode === 'play' ? '' : 'play')} data-testid="filter-activities"><Sparkles size={14} /> Activities</button>
          </div>
        </div>
        {notice && <div className={`inline-notice ${notice.includes('did not') ? 'notice-error' : ''}`} role="status"><CheckCircle2 size={16} />{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={15} /></button></div>}
        {studentsQuery.isLoading ? <StudentSkeletons /> : studentsQuery.isError ? <ErrorState message="We couldn't find students just now." retry={() => studentsQuery.refetch()} /> : students.length ? (
          <div className="student-grid">
            {students.filter((student) => student.userId !== user?.id).map((student) => <StudentCard key={student.userId} student={student} onConnect={() => onConnect(student)} pending={requestConnection.isPending && requestConnection.variables?.data.recipientId === student.userId} />)}
          </div>
        ) : <EmptyState title={search || mode ? 'No matches just yet.' : 'The first hello is yours.'} detail={search || mode ? 'Try another search or clear your filters to see more students.' : 'Check back soon as students make their profiles.'} icon={<Compass size={24} />} action={search || mode ? <button className="text-button" onClick={() => { setSearch(''); setMode(''); }}>Clear filters</button> : undefined} />}
      </section>
      <div className="soft-note"><Sparkles size={17} /><span>Just a starting point. The best connections happen when you show up as yourself.</span></div>
    </div>
  );
}

function StudentSkeletons() {
  return <div className="student-grid">{[0, 1, 2, 3].map((item) => <div className="student-card student-skeleton" key={item}><div className="skeleton skeleton-avatar" /><div className="skeleton skeleton-name" /><div className="skeleton skeleton-copy" /><div className="skeleton skeleton-chip" /></div>)}</div>;
}

function StudentCard({ student, onConnect, pending }: { student: StudentProfile; onConnect: () => void; pending: boolean }) {
  return <article className="student-card" data-testid={`card-student-${student.userId}`}>
    <div className="student-card-top"><div className={`student-avatar avatar-${student.displayName.charCodeAt(0) % 5}`}>{initials(student.displayName)}</div><div className="student-online"><span /> OPEN TO MEET</div></div>
    <h2>{student.displayName}</h2><p className="student-meta">{student.program} <span>·</span> {student.year}</p>
    <p className="student-campus"><GraduationCap size={14} />{student.university}</p>
    <p className="student-bio">{student.bio || 'A new face on campus, ready to meet good people.'}</p>
    <div className="student-tags">{student.lookingFor.map((activity) => <span className="mode-tag" key={`looking-${activity}`}>{activity === 'study' ? 'Study partner' : 'Activity buddy'}</span>)}{student.interests.slice(0, 3).map((interest) => <span key={interest}>{interest}</span>)}</div>
    <div className="student-details"><span><BookOpen size={14} />{student.studyStyle || 'Flexible study style'}</span><span><Clock3 size={14} />{student.availability || 'Schedule varies'}</span></div>
    <button className="button button-outline student-connect" onClick={onConnect} disabled={pending} data-testid={`button-connect-${student.userId}`}>{pending ? 'Sending…' : <>Say hello <ArrowRight size={15} /></>}</button>
  </article>;
}

function MeetupPage() {
  const { userId } = useAuth();
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('');
  const [creating, setCreating] = useState(false);
  const params = useMemo<ListMeetupsParams>(() => ({ q: search.trim() || undefined, mode: mode ? mode as 'study' | 'play' : undefined }), [search, mode]);
  const query = useListMeetups(params, {
    query: {
      queryKey: getListMeetupsQueryKey(params),
      refetchInterval: 30_000,
    },
  });
  const createMeetup = useCreateMeetup();
  const cancelMeetup = useCancelMeetup();
  const join = useJoinMeetup();
  const leave = useLeaveMeetup();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: getListMeetupsQueryKey() });
  const submitMeetup = (input: MeetupInput) => createMeetup.mutate({ data: input }, { onSuccess: async () => { setCreating(false); await refresh(); }, onError: () => {} });
  const toggleJoin = (meetup: Meetup) => {
    const mutation = meetup.joined ? leave : join;
    mutation.mutate({ id: meetup.id }, { onSuccess: refresh });
  };
  const cancel = (meetup: Meetup) => {
    const confirmed = window.confirm(
      `Cancel “${meetup.title}”? This will remove the meetup for everyone.`,
    );
    if (!confirmed) return;
    cancelMeetup.mutate({ id: meetup.id }, { onSuccess: refresh });
  };
  return (
    <div>
      <PageHeader kicker="MAKE A PLAN, MAKE A MEMORY" title={<>Good plans, <em>good people.</em></>} desc="Meetups are shared with your accepted connections. Connect with students to grow your circle, then make a plan together." action={<button className="button button-coral" onClick={() => setCreating(true)}><Plus size={17} /> Start a meetup</button>} />
      <div className="meetup-tools">
        <label className="search-box"><Search size={18} /><span className="sr-only">Search meetups</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search topics or places" data-testid="input-meetup-search" /></label>
        <div className="filter-pills" role="group" aria-label="Filter meetups">
          <button className={`filter-pill ${!mode ? 'selected' : ''}`} onClick={() => setMode('')}>All plans</button>
          <button className={`filter-pill ${mode === 'study' ? 'selected' : ''}`} onClick={() => setMode(mode === 'study' ? '' : 'study')}><BookOpen size={14} /> Study</button>
          <button className={`filter-pill ${mode === 'play' ? 'selected' : ''}`} onClick={() => setMode(mode === 'play' ? '' : 'play')}><Sparkles size={14} /> Activities</button>
        </div>
      </div>
      {createMeetup.isError && <div className="inline-notice notice-error" role="alert">Couldn’t create that meetup. Check your details and try again.</div>}
      {cancelMeetup.isError && <div className="inline-notice notice-error" role="alert">Couldn’t cancel that meetup. Please try again.</div>}
      {query.isLoading ? <MeetupSkeletons /> : query.isError ? <ErrorState message="Meetups aren't loading right now." retry={() => query.refetch()} /> : query.data?.length ? (
        <div className="meetup-grid">{query.data.map((meetup) => <MeetupCard key={meetup.id} meetup={meetup} isOrganizer={meetup.creatorId === userId} onCancel={() => cancel(meetup)} onToggle={() => toggleJoin(meetup)} pending={(cancelMeetup.isPending && cancelMeetup.variables?.id === meetup.id) || (join.isPending && join.variables?.id === meetup.id) || (leave.isPending && leave.variables?.id === meetup.id)} />)}</div>
      ) : <EmptyState title={search || mode ? 'No plans found.' : 'No friend meetups yet.'} detail={search || mode ? 'Try another search or clear your filters to see more meetups.' : 'Connect with students on Discover first. Their upcoming meetups will appear here, and you can start one for your friends.'} icon={<CalendarDays size={24} />} action={<button className="button button-dark" onClick={() => setCreating(true)}><Plus size={15} /> Create a meetup</button>} />}
      {creating && <MeetupDialog onClose={() => setCreating(false)} onSubmit={submitMeetup} pending={createMeetup.isPending} />}
    </div>
  );
}

function MeetupCard({ meetup, isOrganizer, onCancel, onToggle, pending }: { meetup: Meetup; isOrganizer: boolean; onCancel: () => void; onToggle: () => void; pending: boolean }) {
  const isStudy = meetup.mode === 'study';
  const start = new Date(meetup.startsAt);
  const date = Number.isNaN(start.valueOf()) ? 'Time to be announced' : new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(start);
  const filled = meetup.attendeeCount >= meetup.capacity;
  return <article className={`meetup-card ${isStudy ? 'meetup-study' : 'meetup-play'}`} data-testid={`card-meetup-${meetup.id}`}>
    <div className="meetup-card-head"><span className={`meetup-type ${isStudy ? 'type-study' : 'type-play'}`}>{isStudy ? <BookOpen size={14} /> : <Sparkles size={14} />}{isStudy ? 'STUDY SESSION' : 'ACTIVITY SESSION'}</span><span className="meetup-seats">{meetup.attendeeCount}/{meetup.capacity} spots</span></div>
    <h2>{meetup.title}</h2><div className="meetup-topic">{meetup.topic}</div><p className="meetup-description">{meetup.description || 'A simple plan, made better with company.'}</p>
    <div className="meetup-info"><span><CalendarDays size={15} />{date}</span><span>{meetup.isOnline ? <Video size={15} /> : <MapPin size={15} />}{meetup.isOnline ? 'Online call' : meetup.location}</span></div>
    <div className="meetup-card-foot"><div className="host-info"><div className="initial-avatar">{initials(meetup.creatorName)}</div><span>Hosted by <strong>{meetup.creatorName}</strong></span></div><div className="meetup-actions">{meetup.isOnline && meetup.joined && <Link className="button button-coral meetup-call-button" href={`/meetups/${meetup.id}/call`} data-testid={`button-call-${meetup.id}`}><Video size={14} /> Join call</Link>}{isOrganizer ? <button className="button button-cancel" onClick={onCancel} disabled={pending} data-testid={`button-cancel-${meetup.id}`}><X size={14} />{pending ? 'Cancelling…' : 'Cancel meetup'}</button> : <button className={`button ${meetup.joined ? 'button-joined' : 'button-dark'}`} onClick={onToggle} disabled={pending || (!meetup.joined && filled)} data-testid={`button-join-${meetup.id}`}>{pending ? 'One sec…' : meetup.joined ? <><Check size={15} /> Going · leave</> : filled ? 'Full for now' : <>Join us <ArrowRight size={14} /></>}</button>}</div></div>
  </article>;
}

function MeetupSkeletons() {
  return <div className="meetup-grid">{[0, 1, 2].map((item) => <div className="meetup-card skeleton-card" key={item}><div className="skeleton skeleton-chip" /><div className="skeleton skeleton-name" /><div className="skeleton skeleton-copy" /><div className="skeleton skeleton-copy" /></div>)}</div>;
}

function MeetupDialog({ onClose, onSubmit, pending }: { onClose: () => void; onSubmit: (data: MeetupInput) => void; pending: boolean }) {
  const [mode, setMode] = useState<'study' | 'play'>('study');
  const [isOnline, setIsOnline] = useState(false);
  const [error, setError] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') || '').trim();
    const topic = String(form.get('topic') || '').trim();
    const location = isOnline ? 'Online call' : String(form.get('location') || '').trim();
    if (!title || !topic || (!isOnline && !location)) { setError('Add a title, topic, and place so people know what they’re joining.'); return; }
    const date = String(form.get('startsAt') || '');
    if (!date || new Date(date).getTime() <= Date.now()) { setError('Choose a time in the future.'); return; }
    onSubmit({ mode, title, topic, location, isOnline, startsAt: new Date(date).toISOString(), description: String(form.get('description') || '').trim(), capacity: Number(form.get('capacity') || 6) });
  };
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="meetup-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
    <div className="dialog-heading"><div><span className="eyebrow">MAKE IT HAPPEN</span><h2 id="dialog-title" className="display">Start a little <em>something.</em></h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>
    <form onSubmit={submit} className="form-stack">
      <div className="mode-switch" role="group" aria-label="Meetup type"><button type="button" className={mode === 'study' ? 'active' : ''} onClick={() => setMode('study')}><BookOpen size={16} /> Study together</button><button type="button" className={mode === 'play' ? 'active' : ''} onClick={() => setMode('play')}><Sparkles size={16} /> Activities</button></div>
      <label className="field-label">Give it a name<input name="title" required maxLength={120} placeholder="A name people can picture" /></label>
      <label className="field-label">{mode === 'study' ? 'What are we working on?' : 'What activity are you planning?'}<input name="topic" required maxLength={80} placeholder={mode === 'study' ? 'Biology midterm review' : 'A co-op game or creative session'} /></label>
      <label className="field-label">A little more detail <span className="optional">optional</span><textarea name="description" maxLength={500} rows={3} placeholder="The vibe, what to bring, anything useful…" /></label>
      <fieldset className="online-choice"><legend className="field-label">How are you meeting?</legend><div className="mode-switch"><button type="button" className={!isOnline ? 'active' : ''} onClick={() => setIsOnline(false)}><MapPin size={15} /> In person</button><button type="button" className={isOnline ? 'active' : ''} onClick={() => setIsOnline(true)}><Video size={15} /> Online call</button></div></fieldset>
      <div className="form-row">{isOnline ? <div className="online-meetup-note"><Video size={17} /><span><strong>Your Versari call room will be ready.</strong><small>Only students who join the meetup can enter.</small></span></div> : <label className="field-label">Where<input name="location" required maxLength={120} placeholder="Library, room 2B" /></label>}<label className="field-label">When<input name="startsAt" type="datetime-local" required /></label></div>
      <label className="field-label capacity-field">Group size<select name="capacity" defaultValue="6"><option value="2">2 people</option><option value="4">4 people</option><option value="6">6 people</option><option value="10">10 people</option><option value="15">15 people</option><option value="25">25 people</option><option value="50">Up to 50</option></select></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button type="submit" className="button button-coral" disabled={pending}>{pending ? 'Putting it together…' : <>Post meetup <ArrowRight size={15} /></>}</button></div>
    </form>
  </section></div>;
}

type ActivityMode = 'study' | 'play';
type FriendRequestState = Partial<Record<ActivityMode, 'sent' | 'incoming'>>;

function ConnectionsPage() {
  const query = useListConnections({
    query: { queryKey: getListConnectionsQueryKey(), refetchInterval: 30_000 },
  });
  const activityQuery = useListActivityRequests({
    query: {
      queryKey: getListActivityRequestsQueryKey(),
      refetchInterval: 30_000,
    },
  });
  const update = useUpdateConnection();
  const createActivity = useCreateActivityRequest();
  const updateActivity = useUpdateActivityRequest();
  const client = useQueryClient();
  const { user } = useUser();
  const [tab, setTab] = useState<'incoming' | 'outgoing' | 'connected' | 'activity'>('incoming');
  const [activityNotice, setActivityNotice] = useState('');
  const connections = query.data || [];
  const activityRequests = activityQuery.data || [];
  const incoming = connections.filter((item) => item.status === 'pending' && item.recipientId === user?.id);
  const outgoing = connections.filter((item) => item.status === 'pending' && item.requesterId === user?.id);
  const connected = connections.filter((item) => item.status === 'accepted');
  const incomingActivities = activityRequests.filter((item) => item.status === 'pending' && item.recipientId === user?.id);
  const current = tab === 'incoming' ? incoming : tab === 'outgoing' ? outgoing : connected;

  const updateConnectionStatus = (connection: Connection, status: 'accepted' | 'declined') => {
    update.mutate({ id: connection.id, data: { status } }, {
      onSuccess: async () => Promise.all([
        client.invalidateQueries({ queryKey: getListConnectionsQueryKey() }),
        client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
        client.invalidateQueries({ queryKey: getListMeetupsQueryKey() }),
      ]),
    });
  };
  const sendActivityRequest = (connection: Connection, mode: ActivityMode) => {
    createActivity.mutate({ data: { recipientId: connection.otherStudent.userId, mode } }, {
      onSuccess: async () => {
        setActivityNotice(`Your ${mode === 'study' ? 'study' : 'activity'} request was sent to ${connection.otherStudent.displayName.split(' ')[0]}.`);
        await client.invalidateQueries({ queryKey: getListActivityRequestsQueryKey() });
      },
      onError: () => setActivityNotice('Couldn’t send that request. There may already be one waiting.'),
    });
  };
  const respondToActivityRequest = (request: ActivityRequest, status: 'accepted' | 'declined') => {
    updateActivity.mutate({ id: request.id, data: { status } }, {
      onSuccess: async () => {
        setActivityNotice(status === 'accepted' ? 'You accepted the request.' : 'You declined the request.');
        await client.invalidateQueries({ queryKey: getListActivityRequestsQueryKey() });
      },
      onError: () => setActivityNotice('Couldn’t update that request. Please try again.'),
    });
  };
  const requestStateFor = (friendId: string, mode: ActivityMode): FriendRequestState[ActivityMode] => {
    const pendingRequest = activityRequests.find((request) =>
      request.otherStudent.userId === friendId &&
      request.mode === mode &&
      request.status === 'pending',
    );
    if (!pendingRequest) return undefined;
    return pendingRequest.requesterId === user?.id ? 'sent' : 'incoming';
  };

  return <div>
      <PageHeader kicker="YOUR CIRCLE, TAKING SHAPE" title={<>Good to see <em>you here.</em></>} desc="Accept a hello to become friends, then send a quick study or activity request whenever you like." />
    <div className="connections-tabs" role="tablist" aria-label="Connections and activity requests">
      <button role="tab" aria-selected={tab === 'incoming'} className={tab === 'incoming' ? 'selected' : ''} onClick={() => setTab('incoming')}>Incoming <span>{incoming.length}</span></button>
      <button role="tab" aria-selected={tab === 'outgoing'} className={tab === 'outgoing' ? 'selected' : ''} onClick={() => setTab('outgoing')}>Sent <span>{outgoing.length}</span></button>
      <button role="tab" aria-selected={tab === 'connected'} className={tab === 'connected' ? 'selected' : ''} onClick={() => setTab('connected')}>Your people <span>{connected.length}</span></button>
      <button role="tab" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'selected' : ''} onClick={() => setTab('activity')}>Study / activities <span>{incomingActivities.length}</span></button>
    </div>
    {activityNotice && <div className={`inline-notice ${activityNotice.startsWith('Couldn’t') ? 'notice-error' : ''}`} role="status" data-testid="status-activity-request"><CheckCircle2 size={16} />{activityNotice}<button aria-label="Dismiss message" onClick={() => setActivityNotice('')}><X size={15} /></button></div>}

    {tab === 'activity' ? (
      activityQuery.isLoading ? <div className="connection-list">{[0, 1, 2].map((item) => <div className="connection-skeleton skeleton" key={item} />)}</div>
        : activityQuery.isError ? <ErrorState message="Your study and activity requests aren't loading right now." retry={() => activityQuery.refetch()} />
          : activityRequests.length ? <div className="connection-list">
            {activityRequests.map((request) => <ActivityRequestCard
              key={request.id}
              request={request}
              currentUserId={user?.id || ''}
              pending={updateActivity.isPending && updateActivity.variables?.id === request.id}
              onRespond={(status) => respondToActivityRequest(request, status)}
            />)}
          </div>
            : <EmptyState icon={<MessageCircle size={23} />} title="No study or activity requests yet." detail="Send a quick request from one of your accepted connections to get a plan started." action={<button className="button button-dark" onClick={() => setTab('connected')}>See your friends <ArrowRight size={15} /></button>} />
    ) : query.isLoading ? <div className="connection-list">{[0, 1, 2].map((item) => <div className="connection-skeleton skeleton" key={item} />)}</div>
      : query.isError ? <ErrorState message="Your connections aren't loading right now." retry={() => query.refetch()} />
        : current.length ? <div className="connection-list">
          {current.map((connection) => {
            const studentId = connection.otherStudent.userId;
            const requestingFriend = createActivity.isPending && createActivity.variables?.data.recipientId === studentId;
            return <ConnectionCard
              key={connection.id}
              connection={connection}
              tab={tab}
              pending={update.isPending && update.variables?.id === connection.id}
              onAccept={() => updateConnectionStatus(connection, 'accepted')}
              onDecline={() => updateConnectionStatus(connection, 'declined')}
              requestState={{ study: requestStateFor(studentId, 'study'), play: requestStateFor(studentId, 'play') }}
              requestPending={requestingFriend}
              onRequestActivity={(mode) => sendActivityRequest(connection, mode)}
              onOpenRequests={() => setTab('activity')}
            />;
          })}
        </div>
          : <EmptyState icon={<MessageCircle size={23} />} title={tab === 'incoming' ? 'A little quiet for now.' : tab === 'outgoing' ? 'No hellos sent yet.' : 'Your circle is just getting started.'} detail={tab === 'incoming' ? 'When someone reaches out, their note will land here.' : 'Explore students and find someone you’d like to meet.'} action={<Link href="/discover" className="button button-dark">Find your people <ArrowRight size={15} /></Link>} />}
    {update.isError && <div className="inline-notice notice-error" role="alert">Couldn’t update that connection. Try again.</div>}
  </div>;
}

function ConnectionCard({
  connection,
  tab,
  pending,
  onAccept,
  onDecline,
  requestState = {},
  requestPending = false,
  onRequestActivity,
  onOpenRequests,
}: {
  connection: Connection;
  tab: string;
  pending: boolean;
  onAccept: () => void;
  onDecline: () => void;
  requestState?: FriendRequestState;
  requestPending?: boolean;
  onRequestActivity?: (mode: ActivityMode) => void;
  onOpenRequests?: () => void;
}) {
  const student = connection.otherStudent;
  const requestButton = (mode: ActivityMode) => {
    const state = requestState[mode];
    const activityLabel = mode === 'study' ? 'study' : 'activities';
    const label = state === 'sent'
      ? 'Request sent'
      : state === 'incoming'
        ? 'Reply to request'
        : mode === 'study' ? 'Ask to study' : 'Ask about activities';
    return <button
      className="button button-outline"
      onClick={() => state === 'incoming' ? onOpenRequests?.() : onRequestActivity?.(mode)}
      disabled={requestPending || state === 'sent'}
      aria-label={state === 'incoming' ? `Reply to ${student.displayName}'s ${activityLabel} request` : `Send a ${activityLabel} request to ${student.displayName}`}
      data-testid={`button-${mode}-request-${student.userId}`}
    >{mode === 'study' ? <BookOpen size={14} /> : <Sparkles size={14} />}{label}</button>;
  };
  return <article className="connection-card" data-testid={`card-connection-${connection.id}`}><div className={`student-avatar avatar-${student.displayName.charCodeAt(0) % 5}`}>{initials(student.displayName)}</div>
    <div className="connection-copy"><h2>{student.displayName}</h2><p>{student.program} <span>·</span> {student.year} <span>·</span> {student.university}</p><p className="connection-bio">{student.bio || 'Looking forward to meeting more people on campus.'}</p><div className="student-tags">{student.interests.slice(0, 3).map((interest) => <span key={interest}>{interest}</span>)}</div></div>
    <div className={`connection-actions ${tab === 'connected' ? 'connection-friend-actions' : ''}`}>{tab === 'incoming' ? <><button className="button button-dark" onClick={onAccept} disabled={pending} data-testid={`button-accept-${connection.id}`}>{pending ? 'One sec…' : <><Check size={15} /> Accept</>}</button><button className="text-button decline-button" onClick={onDecline} disabled={pending} data-testid={`button-decline-${connection.id}`}>Not now</button></> : tab === 'outgoing' ? <span className="status-pill"><Clock3 size={14} /> Waiting on a hello</span> : <>
      <span className="status-pill connected-pill"><CheckCircle2 size={14} /> Connected</span>
      <div className="friend-activity-actions">{requestButton('study')}{requestButton('play')}</div>
    </>}</div>
  </article>;
}

function ActivityRequestCard({
  request,
  currentUserId,
  pending,
  onRespond,
}: {
  request: ActivityRequest;
  currentUserId: string;
  pending: boolean;
  onRespond: (status: 'accepted' | 'declined') => void;
}) {
  const student = request.otherStudent;
  const incoming = request.recipientId === currentUserId;
  const activity = request.mode === 'study' ? 'study together' : 'do activities together';
  const statusLabel = request.status === 'pending'
    ? incoming ? 'Needs your reply' : 'Waiting for a reply'
    : request.status === 'accepted' ? 'Accepted' : 'Declined';
  return <article className="connection-card" data-testid={`card-activity-request-${request.id}`}>
    <div className={`student-avatar avatar-${student.displayName.charCodeAt(0) % 5}`}>{initials(student.displayName)}</div>
    <div className="connection-copy">
      <h2>{student.displayName}</h2>
      <p>{incoming ? `${student.displayName} asked to ${activity}.` : `You asked ${student.displayName} to ${activity}.`}</p>
      <p className="connection-bio">{student.program} <span>·</span> {student.year}</p>
    </div>
    <div className="connection-actions">
      {incoming && request.status === 'pending' ? <>
        <button className="button button-dark" onClick={() => onRespond('accepted')} disabled={pending} data-testid={`button-accept-activity-${request.id}`}>{pending ? 'One sec…' : <><Check size={15} /> Accept</>}</button>
        <button className="text-button decline-button" onClick={() => onRespond('declined')} disabled={pending} data-testid={`button-decline-activity-${request.id}`}>Not now</button>
      </> : <span className={`status-pill ${request.status === 'accepted' ? 'connected-pill' : ''}`} data-testid={`status-activity-${request.id}`}>{statusLabel}</span>}
    </div>
  </article>;
}

const emptyProfile: ProfileInput = { displayName: '', university: '', program: '', year: '', bio: '', interests: [], lookingFor: ['study', 'play'], studyStyle: '', availability: '' };

function ProfilePage() {
  const { user } = useUser();
  const campus = campusFromVerifiedEmails(user?.emailAddresses);
  const { data: profile, isLoading, isError, refetch } = useGetMyProfile();
  const save = useSaveMyProfile();
  const client = useQueryClient();
  const [, setLocation] = useLocation();
  const [saved, setSaved] = useState(false);
  const [lookingForError, setLookingForError] = useState('');
  const [draft, setDraft] = useState<ProfileInput | null>(null);
  const [interestsText, setInterestsText] = useState<string | null>(null);
  const values = draft || (profile ? {
    displayName: profile.displayName, university: profile.university, program: profile.program, year: profile.year,
    bio: profile.bio, interests: profile.interests || [], lookingFor: profile.lookingFor?.length ? profile.lookingFor : ['study', 'play'], studyStyle: profile.studyStyle, availability: profile.availability,
  } : { ...emptyProfile, university: campus || '' });
  const setField = (field: keyof ProfileInput, value: string) => { setSaved(false); setDraft((current) => ({ ...(current || values), [field]: value })); };
  const interestInputValue = interestsText ?? values.interests.join(', ');
  const toggleLookingFor = (mode: 'study' | 'play') => {
    setSaved(false);
    setLookingForError('');
    setDraft((current) => {
      const selected = current || values;
      const lookingFor = selected.lookingFor.includes(mode)
        ? selected.lookingFor.filter((item) => item !== mode)
        : [...selected.lookingFor, mode];
      return { ...selected, lookingFor };
    });
  };
  if (isLoading) return <PageLoading />;
  if (isError) return <ErrorState message="We couldn't load your profile." retry={() => refetch()} />;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const lookingFor = form.getAll('lookingFor').filter((value): value is 'study' | 'play' => value === 'study' || value === 'play');
    if (!lookingFor.length) {
      setLookingForError('Choose at least one way you would like to connect.');
      return;
    }
    const next: ProfileInput = {
      displayName: String(form.get('displayName') || '').trim(), university: String(form.get('university') || '').trim(),
      program: String(form.get('program') || '').trim(), year: String(form.get('year') || '').trim(),
      bio: String(form.get('bio') || '').trim(), interests: String(form.get('interests') || '').split(',').map((item) => item.trim()).filter(Boolean).slice(0, 12),
      lookingFor,
      studyStyle: String(form.get('studyStyle') || '').trim(), availability: String(form.get('availability') || '').trim(),
    };
    save.mutate({ data: next }, { onSuccess: async () => { setDraft(next); setInterestsText(next.interests.join(', ')); setSaved(true); await client.invalidateQueries({ queryKey: getGetMyProfileQueryKey() }); if (!profile) setLocation('/discover'); }, onError: () => setSaved(false) });
  };
  return <div>
    <PageHeader kicker={profile ? 'YOUR LITTLE CORNER OF CAMPUS' : 'A GOOD PLACE TO START'} title={profile ? <>Make it <em>you.</em></> : <>First, a little <em>about you.</em></>} desc={profile ? 'The details that help your people find you — and know what to say hello about.' : 'Your email is verified. Now tell fellow students a little about the person behind it.'} />
    {!profile && <div className="onboarding-banner"><Sparkles size={18} /><span><strong>Welcome to Versari.</strong> This is your first step toward finding your campus people.</span></div>}
    <form className="profile-form paper-shadow" onSubmit={submit}>
      <div className="profile-form-title"><div className="profile-avatar-large">{initials(values.displayName || 'You')}</div><div><h2 className="display">The basics</h2><p>Start with the details people need to find common ground.</p></div></div>
      <div className="form-row"><label className="field-label">What should we call you?<input name="displayName" required maxLength={80} value={values.displayName} onChange={(event) => setField('displayName', event.target.value)} placeholder="Your name" /></label><label className="field-label">Your campus<input name="university" required maxLength={120} value={campus || values.university} readOnly aria-describedby="campus-assigned-help" /><span className="optional" id="campus-assigned-help">Assigned from your verified student email.</span></label></div>
      <div className="form-row"><label className="field-label">What are you studying?<input name="program" required maxLength={100} value={values.program} onChange={(event) => setField('program', event.target.value)} placeholder="Program or area of study" /></label><label className="field-label">Year at university<select name="year" required value={values.year} onChange={(event) => setField('year', event.target.value)}><option value="">Choose your year</option><option>First year</option><option>Second year</option><option>Third year</option><option>Fourth year</option><option>Fifth year or beyond</option><option>Graduate student</option><option>Other</option></select></label></div>
      <label className="field-label">A little about you<textarea name="bio" maxLength={500} rows={4} value={values.bio} onChange={(event) => setField('bio', event.target.value)} placeholder="What makes you, you? What kind of people or plans are you hoping to find?" /></label>
      <label className="field-label">Things you’re into <span className="optional">Separate with commas · up to 12</span><input name="interests" maxLength={600} value={interestInputValue} onChange={(event) => { setSaved(false); setInterestsText(event.target.value); }} placeholder="Film photography, climbing, ramen…" /></label>
      <fieldset className="activity-fieldset"><legend className="field-label">I’d like to find people to…</legend><div className="activity-options">
        <label className={`activity-option ${values.lookingFor.includes('study') ? 'selected' : ''}`}><input type="checkbox" name="lookingFor" value="study" checked={values.lookingFor.includes('study')} onChange={() => toggleLookingFor('study')} data-testid="checkbox-looking-for-study" /><BookOpen size={17} /><span>Study together</span></label>
        <label className={`activity-option ${values.lookingFor.includes('play') ? 'selected' : ''}`}><input type="checkbox" name="lookingFor" value="play" checked={values.lookingFor.includes('play')} onChange={() => toggleLookingFor('play')} data-testid="checkbox-looking-for-play" /><Sparkles size={17} /><span>Do activities together</span></label>
      </div><span className="optional">Choose at least one.</span>{lookingForError && <span className="field-error" role="alert">{lookingForError}</span>}</fieldset>
      <div className="form-row"><label className="field-label">Your study style<input name="studyStyle" maxLength={80} value={values.studyStyle} onChange={(event) => setField('studyStyle', event.target.value)} placeholder="Quiet focus, or talk it out?" /></label><label className="field-label">When are you usually free?<input name="availability" maxLength={120} value={values.availability} onChange={(event) => setField('availability', event.target.value)} placeholder="Weekday afternoons, weekends…" /></label></div>
      {save.isError && <p className="form-error" role="alert">We couldn’t save that just yet. Please try again.</p>}
      {saved && <p className="saved-message" role="status"><CheckCircle2 size={16} /> Your profile is saved. Now people know how to find you.</p>}
      <div className="profile-actions"><span><CheckCircle2 size={15} /> Visible to verified {campus || 'campus'} members.</span><button className="button button-coral" type="submit" disabled={save.isPending}>{save.isPending ? 'Saving your profile…' : profile ? <>Save changes <Check size={15} /></> : <>Finish your profile <ArrowRight size={15} /></>}</button></div>
    </form>
  </div>;
}

function EmptyState({ title, detail, icon, action }: { title: string; detail: string; icon: ReactNode; action?: ReactNode }) {
  return <section className="empty-state"><div className="empty-icon">{icon}</div><h2 className="display">{title}</h2><p>{detail}</p>{action && <div className="empty-action">{action}</div>}</section>;
}

function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return <div className="error-state" role="alert"><CircleHelp size={20} /><span>{message}</span><button className="text-button" onClick={retry}>Try again <ArrowRight size={14} /></button></div>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const nextId = user?.id ?? null;
      if (previousIdRef.current !== undefined && previousIdRef.current !== nextId) client.clear();
      previousIdRef.current = nextId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function HomeRoute() {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return <PageLoading />;
  return isSignedIn ? <Redirect to="/discover" /> : <Landing />;
}

function ProtectedDiscover() { return <MemberGate><DiscoverPage /></MemberGate>; }
function ProtectedMeetups() { return <MemberGate><MeetupPage /></MemberGate>; }
function ProtectedConnections() { return <MemberGate><ConnectionsPage /></MemberGate>; }
function ProtectedProfile() { return <MemberGate><ProfilePage /></MemberGate>; }
function ProtectedMeetupCall() { return <MemberGate><MeetupCallPage /></MemberGate>; }

function MeetupCallPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const callToken = useCreateMeetupCallToken();
  const [requestedRoomId, setRequestedRoomId] = useState<string | null>(null);
  const callData = requestedRoomId === id ? callToken.data : undefined;
  const callError = requestedRoomId === id && callToken.isError;
  const callIsPending = requestedRoomId === id && callToken.isPending;
  const errorMessage = hasHttpStatus(callToken.error, 404)
    ? 'Join this meetup before entering its call.'
    : hasHttpStatus(callToken.error, 409)
      ? 'This meetup does not have an online call room.'
      : hasHttpStatus(callToken.error, 503)
        ? 'Versari’s secure video service is not connected yet.'
        : 'We could not start this call. Please try again.';

  return <main className="online-call-page">
    <Link className="call-back-link" href="/meetups"><ArrowRight size={15} /> Back to meetups</Link>
    <header className="online-call-header">
      <span className="eyebrow">VERSARI ONLINE ROOM</span>
      <h1 className="display">{callData?.title || 'Join your meetup call'}</h1>
      <p>Hosted securely by Jitsi. Your camera and microphone stay off until you turn them on.</p>
    </header>
    {callData ? <div className="call-frame">
      <JaaSMeeting
        appId={callData.appId}
        roomName={callData.roomName}
        jwt={callData.token}
        configOverwrite={{
          prejoinPageEnabled: true,
          startWithAudioMuted: true,
          startWithVideoMuted: true,
          disableDeepLinking: true,
        }}
        interfaceConfigOverwrite={{
          MOBILE_APP_PROMO: false,
          TILE_VIEW_MAX_COLUMNS: 4,
        }}
        onReadyToClose={() => setLocation('/meetups')}
        getIFrameRef={(iframeRef) => {
          iframeRef.style.width = '100%';
          iframeRef.style.height = 'min(72vh, 760px)';
          iframeRef.style.border = '0';
        }}
      />
    </div> : <section className="call-entry-card">
      <div className="call-entry-icon"><Video size={22} /></div>
      <h2 className="display">Meet face to face, from anywhere.</h2>
      <p>Only students who joined this meetup can enter. You’ll be able to preview your camera and microphone before joining.</p>
      {callError && <div className="inline-notice notice-error" role="alert">{errorMessage}</div>}
      <button className="button button-coral" onClick={() => { setRequestedRoomId(id); callToken.mutate({ id }); }} disabled={callIsPending}>
        {callIsPending ? 'Opening your room…' : <>Enter call <Video size={16} /></>}
      </button>
    </section>}
  </main>;
}

function ClerkApp() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={appearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Your campus people are right here.' }, emailCode: { title: 'Check your inbox', subtitle: 'Enter the code we sent to your email.' } },
      signUp: { start: { title: 'Come on in', subtitle: 'A good campus connection starts here.' }, emailCode: { title: 'One quick check', subtitle: 'Verify your email to join the community.' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkQueryClientCacheInvalidator />
      <Switch>
        <Route path="/" component={HomeRoute} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/discover" component={ProtectedDiscover} />
        <Route path="/meetups/:id/call" component={ProtectedMeetupCall} />
        <Route path="/meetups" component={ProtectedMeetups} />
        <Route path="/connections" component={ProtectedConnections} />
        <Route path="/profile" component={ProtectedProfile} />
        <Route component={NotFound} />
      </Switch>
    </QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  if (!clerkPubKey) return <main className="setup-error"><Wordmark /><h1 className="display">Versari is almost ready.</h1><p>Clerk sign-in needs a publishable key to start. Set up Clerk Auth in the workspace to enable student accounts.</p></main>;
  return <WouterRouter base={basePath}><ClerkApp /></WouterRouter>;
}

export default App;
