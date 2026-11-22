import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Eye, KeyRound, Search, UserCheck, UserX, Edit3 } from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/api';
import { formatArabicDate, formatArabicDateTime } from '../../lib/formatters';
import { Modal } from '../../components/Modal';
import { EmptyState, LoadingSkeleton } from '../../components/EmptyState';
import type { ExamResultItem, GradeInfo } from '../../types/domain';

interface AdminStudentRow {
  id: string;
  fullName: string;
  phoneNumber: string;
  gradeId: number;
  gradeName: string;
  status: 'active' | 'suspended';
  mustChangePassword: boolean;
  createdAt: string;
  lastActivityAt: string | null;
  completedExams: number;
  cumulativeEarned: number;
  cumulativePossible: number;
  averagePercentage: number;
}

export const AdminStudentsModule: React.FC<{ grades: GradeInfo[] }> = ({ grades }) => {
  const [students, setStudents] = useState<AdminStudentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');

  // Edit modal
  const [editing, setEditing] = useState<AdminStudentRow | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', phoneNumber: '', gradeId: 1 });
  const [editError, setEditError] = useState('');

  // Reset Password modal (بدون كشف القديمة)
  const [resetTarget, setResetTarget] = useState<AdminStudentRow | null>(null);
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [customTempPwd, setCustomTempPwd] = useState('');
  const [issuedTempPwd, setIssuedTempPwd] = useState('');
  const [resetError, setResetError] = useState('');
  const [copied, setCopied] = useState(false);

  // Details / Results modal
  const [detailsStudent, setDetailsStudent] = useState<{
    student: AdminStudentRow;
    results: ExamResultItem[];
  } | null>(null);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setActionError('');
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: '15',
      });
      if (search.trim()) qs.set('search', search.trim());
      if (gradeFilter) qs.set('gradeId', gradeFilter);

      const res = await apiRequest<{ students: AdminStudentRow[]; total: number }>(
        `/api/admin/students?${qs.toString()}`
      );
      setStudents(res.students);
      setTotal(res.total);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'تعذر تحميل قائمة الطلاب.');
    } finally {
      setLoading(false);
    }
  }, [page, search, gradeFilter]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const handleToggleStatus = async (s: AdminStudentRow) => {
    setActionError('');
    try {
      const nextStatus = s.status === 'active' ? 'suspended' : 'active';
      await apiRequest(`/api/admin/students/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      void loadStudents();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'تعذر تحديث حالة الطالب.');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setEditError('');
    try {
      await apiRequest(`/api/admin/students/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      setEditing(null);
      void loadStudents();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'تعذر تعديل البيانات.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError('');
    setIssuedTempPwd('');
    try {
      const res = await apiRequest<{ temporaryPassword: string }>(
        `/api/admin/students/${resetTarget.id}/reset-password`,
        {
          method: 'POST',
          body: JSON.stringify({
            autoGenerate,
            newPassword: customTempPwd,
          }),
        }
      );
      setIssuedTempPwd(res.temporaryPassword);
      void loadStudents();
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : 'تعذر تعيين كلمة المرور.');
    }
  };

  const openDetails = async (s: AdminStudentRow) => {
    setActionError('');
    try {
      const res = await apiRequest<{ results: ExamResultItem[] }>(`/api/admin/students/${s.id}/details`);
      setDetailsStudent({ student: s, results: res.results });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'تعذر تحميل تفاصيل الطالب.');
    }
  };

  const copyTempPwd = () => {
    if (!issuedTempPwd) return;
    void navigator.clipboard.writeText(issuedTempPwd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">إدارة الطلاب</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            البحث بالاسم الرباعي أو الهاتف، تعديل الصف، إيقاف/تفعيل الحساب، وتعيين كلمة مرور مؤقتة عند نسيانها.
          </p>
        </div>
        <div className="font-mono-nums text-sm text-[#D4AF37]">الإجمالي: {total} طالب</div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#94A3B8] absolute right-3.5 top-3.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="ابحث بالاسم الرباعي أو رقم الهاتف..."
            className="w-full pr-10 pl-3 py-2.5 rounded-xl bg-[#11192C] border border-white/10 text-sm text-[#F8FAFC]"
          />
        </div>
        <select
          value={gradeFilter}
          onChange={(e) => {
            setGradeFilter(e.target.value);
            setPage(1);
          }}
          className="px-4 py-2.5 rounded-xl bg-[#11192C] border border-white/10 text-sm text-[#F8FAFC]"
        >
          <option value="">جميع الصفوف</option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name_ar}
            </option>
          ))}
        </select>
      </div>

      {actionError && (
        <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm">
          {actionError}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : students.length === 0 ? (
        <EmptyState
          icon={Search}
          title="لا يوجد طلاب مطابقون"
          description="لم يتم تسجيل طلاب مطابقين لمعايير البحث الحالية."
        />
      ) : (
        <>
          {/* Mobile Student Cards */}
          <div className="md:hidden space-y-3">
            {students.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-white/10 bg-[#11192C] p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-[#F8FAFC]">{s.fullName}</div>
                    <div className="text-xs text-[#D4AF37] mt-0.5">{s.gradeName}</div>
                    <div className="text-xs font-mono-nums text-[#94A3B8] mt-0.5">
                      {s.phoneNumber}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold shrink-0 ${
                      s.status === 'active'
                        ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                        : 'bg-red-950/60 text-red-300 border border-red-500/30'
                    }`}
                  >
                    {s.status === 'active' ? 'نشط' : 'موقوف'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-white/10 font-mono-nums text-xs">
                  <div>
                    <span className="block text-[10px] text-[#94A3B8]">الامتحانات</span>
                    <span>{s.completedExams}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-[#94A3B8]">التراكمي</span>
                    <span className="text-[#D4AF37]">
                      {s.cumulativeEarned} / {s.cumulativePossible}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-[#94A3B8]">المتوسط</span>
                    <span>{s.averagePercentage}%</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => void openDetails(s)}
                    className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg bg-[#0B1221] border border-white/10 text-xs font-semibold text-[#F8FAFC] inline-flex items-center justify-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#D4AF37]" />
                    النتائج
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(s);
                      setEditForm({
                        fullName: s.fullName,
                        phoneNumber: s.phoneNumber,
                        gradeId: s.gradeId,
                      });
                      setEditError('');
                    }}
                    className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg bg-[#0B1221] border border-white/10 text-xs font-semibold text-[#F8FAFC] inline-flex items-center justify-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#D4AF37]" />
                    تعديل
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResetTarget(s);
                      setAutoGenerate(true);
                      setCustomTempPwd('');
                      setIssuedTempPwd('');
                      setResetError('');
                    }}
                    className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-bold inline-flex items-center justify-center gap-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    كلمة مرور
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleStatus(s)}
                    className={`min-h-[40px] px-3 py-1.5 rounded-lg border text-xs font-bold inline-flex items-center justify-center gap-1 ${
                      s.status === 'active'
                        ? 'bg-red-950/30 border-red-500/30 text-red-300'
                        : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                    }`}
                  >
                    {s.status === 'active' ? (
                      <>
                        <UserX className="w-3.5 h-3.5" />
                        إيقاف
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        تفعيل
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Students Table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-white/10 bg-[#11192C]">
            <table className="w-full text-right text-xs sm:text-sm">
              <thead className="bg-[#0B1221] text-[#D4AF37] border-b border-white/10">
                <tr>
                  <th className="py-3 px-3">الاسم الرباعي</th>
                  <th className="py-3 px-3">الهاتف</th>
                  <th className="py-3 px-3">الصف</th>
                  <th className="py-3 px-3">الحالة</th>
                  <th className="py-3 px-3">الامتحانات</th>
                  <th className="py-3 px-3">التراكمي</th>
                  <th className="py-3 px-3">المتوسط</th>
                  <th className="py-3 px-3">التسجيل / النشاط</th>
                  <th className="py-3 px-3">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-3 font-bold text-[#F8FAFC]">{s.fullName}</td>
                    <td className="py-3 px-3 font-mono-nums text-[#94A3B8]">{s.phoneNumber}</td>
                    <td className="py-3 px-3 text-[#E2E8F0]">{s.gradeName}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-semibold ${
                          s.status === 'active' ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {s.status === 'active' ? 'نشط' : 'موقوف'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono-nums">{s.completedExams}</td>
                    <td className="py-3 px-3 font-mono-nums text-[#D4AF37]">
                      {s.cumulativeEarned} / {s.cumulativePossible}
                    </td>
                    <td className="py-3 px-3 font-mono-nums">{s.averagePercentage}%</td>
                    <td className="py-3 px-3 text-xs text-[#94A3B8]">
                      <div>{formatArabicDate(s.createdAt)}</div>
                      <div>{s.lastActivityAt ? formatArabicDateTime(s.lastActivityAt) : '—'}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void openDetails(s)}
                          title="عرض النتائج"
                          className="p-1.5 rounded-lg bg-[#0B1221] border border-white/10 text-[#94A3B8] hover:text-[#F8FAFC]"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(s);
                            setEditForm({
                              fullName: s.fullName,
                              phoneNumber: s.phoneNumber,
                              gradeId: s.gradeId,
                            });
                            setEditError('');
                          }}
                          title="تعديل البيانات"
                          className="p-1.5 rounded-lg bg-[#0B1221] border border-white/10 text-[#94A3B8] hover:text-[#D4AF37]"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetTarget(s);
                            setAutoGenerate(true);
                            setCustomTempPwd('');
                            setIssuedTempPwd('');
                            setResetError('');
                          }}
                          title="تعيين كلمة مرور جديدة"
                          className="px-2.5 py-1.5 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          تعيين كلمة مرور
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleStatus(s)}
                          title={s.status === 'active' ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                          className={`p-1.5 rounded-lg border ${
                            s.status === 'active'
                              ? 'bg-red-950/30 border-red-500/30 text-red-300'
                              : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                          }`}
                        >
                          {s.status === 'active' ? (
                            <UserX className="w-4 h-4" />
                          ) : (
                            <UserCheck className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Pagination */}
      {total > 15 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-2 rounded-lg bg-[#11192C] text-xs font-bold disabled:opacity-40"
          >
            السابق
          </button>
          <span className="font-mono-nums text-xs text-[#94A3B8]">
            صفحة {page} من {Math.ceil(total / 15)}
          </span>
          <button
            type="button"
            disabled={page >= Math.ceil(total / 15)}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 rounded-lg bg-[#11192C] text-xs font-bold disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}

      {/* Edit Student Modal */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="تعديل بيانات الطالب"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          {editError && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs">
              {editError}
            </div>
          )}
          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">الاسم الرباعي</label>
            <input
              type="text"
              required
              value={editForm.fullName}
              onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#11192C] border border-white/10 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">رقم الهاتف</label>
            <input
              type="text"
              required
              value={editForm.phoneNumber}
              onChange={(e) => setEditForm((f) => ({ ...f, phoneNumber: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#11192C] border border-white/10 text-sm font-mono-nums"
            />
          </div>
          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">الصف الدراسي</label>
            <select
              value={editForm.gradeId}
              onChange={(e) => setEditForm((f) => ({ ...f, gradeId: Number(e.target.value) }))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#11192C] border border-white/10 text-sm"
            >
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="px-4 py-2 rounded-lg bg-[#11192C] text-xs font-bold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[#D4AF37] text-[#07090E] text-xs font-bold"
            >
              حفظ التعديلات
            </button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title="تعيين كلمة مرور جديدة للطالب"
      >
        {resetTarget && (
          <div className="space-y-4">
            <p className="text-sm text-[#94A3B8] leading-relaxed">
              الطالب: <strong className="text-[#F8FAFC]">{resetTarget.fullName}</strong>.
              <br />
              لا يمكن الاطلاع على كلمة المرور القديمة لأنها محفوظة بتجزئة آمنة؛ يمكنك تعيين كلمة مرور مؤقتة جديدة الآن وسيُطلب من الطالب تغييرها فور تسجيل دخوله التالي.
            </p>

            {resetError && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs">
                {resetError}
              </div>
            )}

            {issuedTempPwd ? (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-3">
                <div className="text-xs font-bold text-emerald-300">
                  تم تعيين كلمة المرور المؤقتة (تظهر لمرة واحدة فقط):
                </div>
                <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-[#07090E] border border-white/10">
                  <code className="font-mono text-base font-bold text-[#D4AF37]" dir="ltr">
                    {issuedTempPwd}
                  </code>
                  <button
                    type="button"
                    onClick={copyTempPwd}
                    className="px-3 py-1.5 rounded-lg bg-[#D4AF37] text-[#07090E] text-xs font-bold inline-flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'تم النسخ' : 'نسخ'}
                  </button>
                </div>
                <p className="text-xs text-[#94A3B8]">
                  سلّم هذه الكلمة للطالب بأمان؛ وسيُجبر على تغييرها فور أول تسجيل دخول.
                </p>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAutoGenerate(true)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border ${
                      autoGenerate
                        ? 'bg-[#D4AF37] text-[#07090E] border-[#D4AF37]'
                        : 'bg-[#11192C] text-[#94A3B8] border-white/10'
                    }`}
                  >
                    توليد تلقائي من النظام
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoGenerate(false)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border ${
                      !autoGenerate
                        ? 'bg-[#D4AF37] text-[#07090E] border-[#D4AF37]'
                        : 'bg-[#11192C] text-[#94A3B8] border-white/10'
                    }`}
                  >
                    إدخال كلمة يدوية
                  </button>
                </div>

                {!autoGenerate && (
                  <div>
                    <label className="block text-xs text-[#94A3B8] mb-1">
                      كلمة المرور المؤقتة الجديدة
                    </label>
                    <input
                      type="text"
                      required
                      minLength={6}
                      value={customTempPwd}
                      onChange={(e) => setCustomTempPwd(e.target.value)}
                      placeholder="6 أحرف على الأقل"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#11192C] border border-white/10 text-sm font-mono-nums"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setResetTarget(null)}
                    className="px-4 py-2 rounded-lg bg-[#11192C] text-xs font-bold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-[#D4AF37] text-[#07090E] text-xs font-bold"
                  >
                    تعيين كلمة المرور الآن
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </Modal>

      {/* Student Results Modal */}
      <Modal
        open={Boolean(detailsStudent)}
        onClose={() => setDetailsStudent(null)}
        title={detailsStudent ? `نتائج الطالب: ${detailsStudent.student.fullName}` : ''}
        maxWidthClass="max-w-2xl"
      >
        {detailsStudent && (
          <div className="space-y-4">
            {detailsStudent.results.length === 0 ? (
              <p className="text-sm text-[#94A3B8]">لم يؤدِّ هذا الطالب أي امتحان بعد.</p>
            ) : (
              <div className="space-y-2">
                {detailsStudent.results.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded-xl bg-[#11192C] border border-white/10 flex justify-between items-center text-sm"
                  >
                    <div>
                      <div className="font-bold">{formatArabicDateTime(r.submitted_at)}</div>
                      <div className="text-xs text-[#94A3B8]">
                        صح: {r.correct_count} · خطأ: {r.wrong_count}
                      </div>
                    </div>
                    <div className="font-mono-nums font-bold text-[#D4AF37]">
                      {r.earned_score} / {r.max_score} ({r.percentage}%)
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
